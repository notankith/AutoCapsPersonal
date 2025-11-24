import { createClient } from "@/lib/supabase/server"
import { type CaptionSegment } from "@/lib/pipeline"
import { z } from "zod"
import { type NextRequest, NextResponse } from "next/server"

const overrideSegmentSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
})

const requestSchema = z.object({
  transcriptId: z.string().uuid(),
  targetLanguage: z.string().min(2),
  useMocks: z.boolean().optional(),
  override: z
    .object({
      text: z.string().optional(),
      model: z.string().optional(),
      segments: z.array(overrideSegmentSchema).optional(),
      completion: z.union([z.string(), z.record(z.any())]).optional(),
    })
    .optional(),
})

type TranslationResponse = {
  segments: Array<{ id: string; text: string }>
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const openAiKey = process.env.OPENAI_API_KEY?.trim() || null
  const mocksAllowed = process.env.ENABLE_OPENAI_MOCKS === "true"

  try {
    const body = requestSchema.parse(await request.json())
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("id, upload_id, text, segments")
      .eq("id", body.transcriptId)
      .eq("user_id", user.id)
      .single()

    if (transcriptError || !transcript) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 })
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        upload_id: transcript.upload_id,
        user_id: user.id,
        type: "translation",
        payload: { transcriptId: transcript.id, targetLanguage: body.targetLanguage },
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error("Unable to insert translation job", jobError)
      return NextResponse.json({ error: "Failed to queue translation" }, { status: 500 })
    }

    await supabase
      .from("jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", job.id)

    const useMocks = Boolean(body.useMocks && mocksAllowed)

    if (!body.override && !useMocks && !openAiKey) {
      await markJobFailed(supabase, job.id, "OPENAI_API_KEY missing")
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing. Provide override data, enable ENABLE_OPENAI_MOCKS, or add your API key." },
        { status: 400 },
      )
    }

    let translationSource: TranslationSource
    try {
      translationSource = await resolveTranslationSource({
        segments: transcript.segments as CaptionSegment[],
        targetLanguage: body.targetLanguage,
        override: body.override,
        useMocks,
        openAiKey,
      })
    } catch (overrideError) {
      if (overrideError instanceof TranslationOverrideError) {
        return NextResponse.json({ error: overrideError.message }, { status: 400 })
      }
      throw overrideError
    }

    if (!translationSource) {
      await markJobFailed(supabase, job.id, "Translation provider error")
      return NextResponse.json({ error: "Failed to translate captions" }, { status: 500 })
    }

    const translationMap = new Map(translationSource.segments.map((segment) => [segment.id, segment.text]))
    const translatedSegments = (transcript.segments as CaptionSegment[]).map((segment, index) => ({
      ...segment,
      text: translationMap.get(segment.id) ?? translationSource.segments[index]?.text ?? segment.text,
    }))

    const translatedText = translationSource.text ?? translatedSegments.map((segment) => segment.text).join(" ")

    const { data: newTranslation, error: insertError } = await supabase
      .from("translations")
      .insert({
        transcript_id: transcript.id,
        user_id: user.id,
        target_language: body.targetLanguage,
        model: translationSource.model,
        text: translatedText,
        segments: translatedSegments,
      })
      .select()
      .single()

    if (insertError || !newTranslation) {
      console.error("Failed to persist translation", insertError)
      await markJobFailed(supabase, job.id, "Could not save translation")
      return NextResponse.json({ error: "Could not save translation" }, { status: 500 })
    }

    await supabase
      .from("uploads")
      .update({ status: "translated", latest_translation_id: newTranslation.id, updated_at: new Date().toISOString() })
      .eq("id", transcript.upload_id)

    await supabase
      .from("jobs")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        result: { translationId: newTranslation.id, segments: translatedSegments.length },
      })
      .eq("id", job.id)

    return NextResponse.json({
      translationId: newTranslation.id,
      jobId: job.id,
      targetLanguage: body.targetLanguage,
      segments: translatedSegments,
    })
  } catch (error) {
    console.error("Translation error", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to translate captions" }, { status: 500 })
  }
}

type TranslationSource = {
  segments: Array<{ id: string; text: string }>
  text: string
  model: string
}

async function resolveTranslationSource({
  segments,
  targetLanguage,
  override,
  useMocks,
  openAiKey,
}: {
  segments: CaptionSegment[]
  targetLanguage: string
  override?: z.infer<typeof requestSchema>["override"]
  useMocks: boolean
  openAiKey: string | null
}): Promise<TranslationSource> {
  if (override) {
    return buildOverrideTranslation({ segments, targetLanguage, override })
  }

  if (useMocks) {
    return mockTranslation(segments, targetLanguage)
  }

  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY missing")
  }

  const translation = await translateSegments(segments, targetLanguage, openAiKey)
  return {
    segments: translation.segments,
    text: translation.segments.map((segment) => segment.text).join(" "),
    model: "gpt-4o-mini",
  }
}

async function translateSegments(
  segments: CaptionSegment[],
  targetLanguage: string,
  openAiKey: string,
): Promise<TranslationResponse> {
  const payload = JSON.stringify({
    instructions: `Translate each caption text to ${targetLanguage} while preserving emotion and casing. Return JSON with the same ids.`,
    segments: segments.map((segment) => ({ id: segment.id, text: segment.text })),
  })

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a subtitle translation engine that only returns JSON.",
        },
        {
          role: "user",
          content: payload,
        },
      ],
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error("GPT translation failure", detail)
    throw new Error("Translation API failed")
  }

  const completion = await response.json()
  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error("Translation API returned empty content")
  }

  return JSON.parse(content)
}

async function markJobFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  errorMessage: string,
) {
  await supabase
    .from("jobs")
    .update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", jobId)
}

function buildOverrideTranslation({
  segments,
  targetLanguage,
  override,
}: {
  segments: CaptionSegment[]
  targetLanguage: string
  override: NonNullable<z.infer<typeof requestSchema>["override"]>
}): TranslationSource {
  if (!override.segments?.length && !override.text && !override.completion) {
    throw new TranslationOverrideError("Override payload must include segments, text, or completion data.")
  }

  if (override.completion) {
    let parsed: any
    try {
      parsed = typeof override.completion === "string" ? JSON.parse(override.completion) : override.completion
    } catch (error) {
      throw new TranslationOverrideError("Unable to parse completion JSON.")
    }
    const content = parsed?.choices?.[0]?.message?.content
    if (!content) {
      throw new TranslationOverrideError("Completion payload is missing message content.")
    }
    let translation: any
    try {
      translation = typeof content === "string" ? JSON.parse(content) : content
    } catch (error) {
      throw new TranslationOverrideError("Completion content is not valid JSON.")
    }
    return {
      segments: translation.segments ?? [],
      text: translation.text ?? translation.segments?.map((s: any) => s.text).join(" ") ?? "",
      model: override.model ?? parsed.model ?? "manual-gpt",
    }
  }

  if (override.segments?.length) {
    return {
      segments: override.segments.map((segment, index) => ({
        id: segment.id ?? segments[index]?.id ?? `segment_${index}`,
        text: segment.text,
      })),
      text: override.text ?? override.segments.map((segment) => segment.text).join(" "),
      model: override.model ?? "manual-gpt",
    }
  }

  const base = segments.length ? segments : [{ id: "segment_0", text: "" } as CaptionSegment]
  const sentenceChunks = (override.text ?? "").split(/(?<=[.!?])\s+/).filter(Boolean)
  if (!sentenceChunks.length) {
    throw new TranslationOverrideError("Override text must not be empty.")
  }

  const aligned = base.map((segment, index) => ({
    id: segment.id,
    text: sentenceChunks[index] ?? sentenceChunks[sentenceChunks.length - 1],
  }))

  return {
    segments: aligned,
    text: sentenceChunks.join(" "),
    model: override.model ?? "manual-gpt",
  }
}

function mockTranslation(segments: CaptionSegment[], targetLanguage: string): TranslationSource {
  const mockSegments = segments.map((segment) => ({
    id: segment.id,
    text: `[${targetLanguage}] ${segment.text}`,
  }))

  return {
    segments: mockSegments,
    text: mockSegments.map((segment) => segment.text).join(" "),
    model: "mock-gpt",
  }
}

class TranslationOverrideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TranslationOverrideError"
  }
}
