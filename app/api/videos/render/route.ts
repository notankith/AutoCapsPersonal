import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildCaptionFile } from "@/lib/captions"
import {
  STORAGE_BUCKETS,
  captionRequestSchema,
  assertEnv,
  type CaptionSegment
} from "@/lib/pipeline"

import jwt from "jsonwebtoken"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  try {
    const body = captionRequestSchema.parse(await request.json())
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch upload row
    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .select("*")
      .eq("id", body.uploadId)
      .eq("user_id", user.id)
      .single()

    if (uploadError || !upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    // Build caption segments
    let captionSource
    try {
      captionSource = await resolveCaptionSource(supabase, upload.id, user.id, body)
    } catch (lookupError) {
      return NextResponse.json({ error: (lookupError as Error).message }, { status: 404 })
    }

    const captionFile = buildCaptionFile(body.template, captionSource.segments)
    const captionBuffer = Buffer.from(captionFile.content, "utf-8")


    let overlays: import("@/lib/pipeline").RenderOverlay[] = [];
    if (body.template === "karaoke") {
      const KEYWORD_OVERLAY_URL = "https://raw.githubusercontent.com/notankith/cloudinarytest/refs/heads/main/Money.gif";
      overlays = captionSource.segments
        .filter((s) => /(\brich\b|\bmoney\b|\bwealth\b)/i.test(s.text))
        .map((s) => ({ url: KEYWORD_OVERLAY_URL, start: s.start, end: s.end, x: 0, width: 220 }));
      console.log('[API] Overlay segments for money/rich/wealth (karaoke only):', overlays);
    }

    // overlays already computed above

    const basePayload = {
      template: body.template,
      resolution: body.resolution,
      transcriptId: captionSource.transcriptId,
      translationId: captionSource.translationId,
      videoPath: upload.storage_path,
      captionPath: "",
      segmentsProvided: Boolean(body.segments?.length),
      segmentCount: captionSource.segments.length,
      overlays: overlays,
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        upload_id: upload.id,
        user_id: user.id,
        type: "render",
        payload: basePayload,
        status: "queued",
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error("Unable to create render job", jobError)
      return NextResponse.json({ error: "Failed to queue render job" }, { status: 500 })
    }

    // Upload caption file
    const captionPath = `${upload.user_id}/${upload.id}/${job.id}.${captionFile.format}`

    await supabase
      .from("jobs")
      .update({ payload: { ...basePayload, captionPath } })
      .eq("id", job.id)

    const { error: captionUploadError } = await admin.storage
      .from(STORAGE_BUCKETS.captions)
      .upload(captionPath, captionBuffer, {
        upsert: true,
        contentType: captionFile.format === "srt" ? "text/plain" : "text/x-ass",
      })

    if (captionUploadError) {
      console.error("Unable to upload caption file", captionUploadError)
      await supabase.from("jobs").update({ status: "failed" }).eq("id", job.id)
      return NextResponse.json({ error: "Failed to store caption file" }, { status: 500 })
    }

    // Update upload status
    await supabase
      .from("uploads")
      .update({
        status: "rendering",
        caption_asset_path: captionPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", upload.id)

    // Worker vars
    const workerUrl = assertEnv("FFMPEG_WORKER_URL", process.env.FFMPEG_WORKER_URL)
    const workerSecret = assertEnv("WORKER_JWT_SECRET", process.env.WORKER_JWT_SECRET)

    const token = jwt.sign({ jobId: job.id, uploadId: upload.id }, workerSecret, {
      expiresIn: "10m",
    })

    // overlays already computed above

    const renderPayload = {
      jobId: job.id,
      uploadId: upload.id,
      videoPath: upload.storage_path,
      captionPath,
      captionFormat: captionFile.format,
      template: body.template,
      resolution: body.resolution,
      outputPath: `${upload.user_id}/${job.id}/rendered.mp4`,
      overlays,
    }

    // Send to worker (IMPORTANT: /render route restored)
    const workerResponse = await fetch(`${workerUrl}/render`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(renderPayload),
    })

    if (!workerResponse.ok) {
      const reason = await workerResponse.text()
      console.error("Worker rejected render job", reason)

      await supabase.from("jobs").update({
        status: "failed",
        error: "Worker rejected job",
      }).eq("id", job.id)

      return NextResponse.json({ error: "Worker rejected job" }, { status: 502 })
    }

    return NextResponse.json({
      jobId: job.id,
      uploadId: upload.id,
      captionPath,
      videoPath: upload.storage_path,
      outputPath: `${upload.user_id}/${job.id}/rendered.mp4`,
      status: "queued",
    })
  } catch (error) {
    console.error("Render enqueue error", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to enqueue render" }, { status: 500 })
  }
}

// fetch transcript/translation
async function resolveCaptionSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uploadId: string,
  userId: string,
  body: z.infer<typeof captionRequestSchema>,
) {

  if (body.segments?.length) {
    // If karaoke template, normalize segments for per-word timings
    if (body.template === "karaoke") {
      const normalizedSegments = body.segments.map((segment) => {
        // Always rebuild words array from text, ignore any provided words
        const tokens = segment.text?.split(/\s+/) ?? [];
        const duration = Math.max(0, Number(segment.end) - Number(segment.start));
        const perToken = tokens.length ? duration / tokens.length : 0.2;
        const words = tokens.map((token, i) => ({
          text: token,
          start: Number(segment.start) + perToken * i,
          end: Number(segment.start) + perToken * (i + 1)
        }));
        return { ...segment, words };
      });
      return {
        transcriptId: body.transcriptId ?? null,
        translationId: body.translationId ?? null,
        segments: sanitizeClientSegments(normalizedSegments),
      };
    }
    // Otherwise, normal segment handling
    return {
      transcriptId: body.transcriptId ?? null,
      translationId: body.translationId ?? null,
      segments: sanitizeClientSegments(body.segments),
    };
  }

  if (body.translationId) {
    const { data: translation, error } = await supabase
      .from("translations")
      .select("id, segments, transcript_id, transcripts!inner(id, upload_id)")
      .eq("id", body.translationId)
      .eq("user_id", userId)
      .eq("transcripts.upload_id", uploadId)
      .single()

    if (error || !translation) throw new Error("Translation not found")

    return {
      transcriptId: translation.transcript_id,
      translationId: translation.id,
      segments: translation.segments as CaptionSegment[],
    }
  }

  const transcriptId = body.transcriptId ?? null
  const filter = transcriptId ? { col: "id", value: transcriptId } : { col: "upload_id", value: uploadId }

  const { data: transcript, error } = await supabase
    .from("transcripts")
    .select("id, segments")
    .eq(filter.col, filter.value)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error || !transcript) throw new Error("Transcript not found")

  return {
    transcriptId: transcript.id,
    translationId: null,
    segments: transcript.segments as CaptionSegment[],
  }
}

function sanitizeClientSegments(rawSegments: NonNullable<z.infer<typeof captionRequestSchema>["segments"]>): CaptionSegment[] {
  return rawSegments.map((segment, index) => {
    const fallbackStart = index * 2
    const start = Number.isFinite(segment.start) ? Number(segment.start) : fallbackStart
    const minEnd = start + 0.2
    const endCandidate = Number.isFinite(segment.end) ? Number(segment.end) : minEnd
    const end = endCandidate > start ? endCandidate : minEnd
    const text = segment.text?.trim() ?? ""
    const words = segment.words?.map((word, wordIndex) => {
      const wordStart = Number.isFinite(word.start) ? Number(word.start) : start + wordIndex * 0.2
      const wordEndCandidate = Number.isFinite(word.end) ? Number(word.end) : wordStart + 0.2
      const wordEnd = wordEndCandidate > wordStart ? wordEndCandidate : wordStart + 0.2
      return {
        start: wordStart,
        end: wordEnd,
        text: word.text?.trim() ?? "",
      }
    })

    return {
      id: segment.id ? String(segment.id) : `segment_${index}`,
      start,
      end,
      text,
      words,
    }
  })
}
