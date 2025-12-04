import { getDb } from "@/lib/mongodb"
import { type CaptionSegment } from "@/lib/pipeline"
import { z } from "zod"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"

const overrideSegmentSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
})

const requestSchema = z.object({
  transcriptId: z.string().min(1),
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
  const db = await getDb()
  const openAiKey = process.env.OPENAI_API_KEY?.trim() || null
  const mocksAllowed = process.env.ENABLE_OPENAI_MOCKS === "true"
  
  // TODO: Get userId from JWT token instead of hardcoding
  const userId = "default-user"

  try {
    const body = requestSchema.parse(await request.json())

    let transcript
    try {
      transcript = await db.collection("transcripts").findOne({
        _id: new ObjectId(body.transcriptId),
        user_id: userId,
      })
    } catch (error) {
      return NextResponse.json({ error: "Invalid transcript ID format" }, { status: 400 })
    }

    if (!transcript) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 })
    }

    const jobResult = await db.collection("jobs").insertOne({
      upload_id: transcript.upload_id,
      user_id: userId,
      type: "translation",
      payload: { transcriptId: transcript._id.toString(), targetLanguage: body.targetLanguage },
      status: "pending",
      created_at: new Date(),
    })

    const jobId = jobResult.insertedId.toString()

    await db.collection("jobs").updateOne(
      { _id: jobResult.insertedId },
      { $set: { status: "processing", started_at: new Date() } }
    )

    const useMocks = Boolean(body.useMocks && mocksAllowed)

    if (!body.override && !useMocks && !openAiKey) {
      await markJobFailed(db, jobId, "OPENAI_API_KEY missing")
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

    const translationResult = await db.collection("translations").insertOne({
      transcript_id: transcript._id.toString(),
      upload_id: transcript.upload_id,
      user_id: userId,
      target_language: body.targetLanguage,
      model: translationSource.model,
      text: translatedText,
      segments: translatedSegments,
      created_at: new Date(),
    })

    const translationId = translationResult.insertedId.toString()

    await db.collection("uploads").updateOne(
      { _id: new ObjectId(transcript.upload_id) },
      { 
        $set: { 
          status: "translated", 
          latest_translation_id: translationId, 
          updated_at: new Date() 
        } 
      }
    )

    await db.collection("jobs").updateOne(
      { _id: jobResult.insertedId },
      {
        $set: {
          status: "done",
          completed_at: new Date(),
          result: { translationId, segments: translatedSegments.length },
        }
      }
    )

    return NextResponse.json({
      translationId,
      jobId,
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
  db: Awaited<ReturnType<typeof getDb>>,
  jobId: string,
  errorMessage: string,
) {
  await db.collection("jobs").updateOne(
    { _id: new ObjectId(jobId) },
    { 
      $set: { 
        status: "failed", 
        error: errorMessage, 
        completed_at: new Date() 
      } 
    }
  )
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
