import { getDb } from "@/lib/mongodb"
import { downloadFile, getPublicUrl } from "@/lib/oracle-storage"
import { STORAGE_PREFIX, type CaptionSegment } from "@/lib/pipeline"
import { z } from "zod"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
const ASSEMBLYAI_API_BASE = "https://api.assemblyai.com/v2"
const ASSEMBLYAI_POLL_INTERVAL_MS = Number(process.env.ASSEMBLYAI_POLL_INTERVAL_MS ?? 5000)
const ASSEMBLYAI_MAX_POLL_DURATION_MS = Number(process.env.ASSEMBLYAI_MAX_POLL_MS ?? 15 * 60 * 1000)

const manualWordSchema = z.object({
  start: z.number().optional(),
  end: z.number().optional(),
  text: z.string(),
})

const manualSegmentSchema = z.object({
  id: z.string().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  text: z.string(),
  words: z.array(manualWordSchema).optional(),
})

const requestSchema = z.object({
  uploadId: z.string().min(1),
  language: z.string().optional(),
  useMocks: z.boolean().optional(),
  override: z
    .object({
      text: z.string().optional(),
      language: z.string().optional(),
      model: z.string().optional(),
      segments: z.array(manualSegmentSchema).optional(),
      rawResponse: z.record(z.any()).optional(),
    })
    .optional(),
  forceRefresh: z.boolean().optional(),
})

type TranscriptSegment = {
  id: number
  start: number
  end: number
  text: string
  words?: Array<{ start: number; end: number; word: string }>
}

type TranscriptWord = { start: number; end: number; word: string }
const MIN_WORD_DURATION = 0.05
const MIN_SEGMENT_DURATION = 0.2
const MAX_SILENCE_GAP = 0.5
const MAX_SEGMENT_WORDS = 35
const MAX_SEGMENT_DURATION = 9
const ASSEMBLYAI_UPLOAD_HEADERS = {
  "content-type": "application/octet-stream",
}

export async function POST(request: NextRequest) {
  const db = await getDb()
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY?.trim() || null
  const assemblyModel = process.env.ASSEMBLYAI_MODEL?.trim()
  const mocksAllowed = process.env.ENABLE_TRANSCRIPTION_MOCKS === "true"
  
  // TODO: Get userId from JWT token instead of hardcoding
  const userId = "default-user"

  try {
    const body = requestSchema.parse(await request.json())

    let upload
    try {
      upload = await db.collection("uploads").findOne({
        _id: new ObjectId(body.uploadId),
        user_id: userId,
      })
    } catch (error) {
      return NextResponse.json({ error: "Invalid upload ID format" }, { status: 400 })
    }

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    if (upload.status === "expired") {
      return NextResponse.json({ error: "Upload expired" }, { status: 410 })
    }

    const reuseExistingTranscript = !body.forceRefresh && !body.override

    if (reuseExistingTranscript) {
      const existingTranscript = await db.collection("transcripts")
        .find({ upload_id: body.uploadId, user_id: userId })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray()

      if (existingTranscript.length > 0) {
        const transcript = existingTranscript[0]
        const previewPayload = await buildPreviewResponse({
          upload,
          transcript: {
            id: transcript._id.toString(),
            text: transcript.text,
            segments: transcript.segments,
            source_language: transcript.source_language,
          },
          jobId: null,
        })

        return NextResponse.json(previewPayload)
      }
    }

    const jobResult = await db.collection("jobs").insertOne({
      upload_id: upload._id.toString(),
      user_id: userId,
      type: "transcription",
      payload: { language: body.language },
      status: "pending",
      created_at: new Date(),
    })

    const jobId = jobResult.insertedId.toString()

    await db.collection("jobs").updateOne(
      { _id: jobResult.insertedId },
      { 
        $set: { 
          status: "processing", 
          started_at: new Date() 
        } 
      }
    )

    const useMocks = Boolean(body.useMocks && mocksAllowed)

    if (!body.override && !useMocks && !assemblyApiKey) {
      await markJobFailed(db, jobId, "No transcription provider configured")
      return NextResponse.json(
        {
          error:
            "No transcription provider configured. Provide override data, enable ENABLE_TRANSCRIPTION_MOCKS, or add your ASSEMBLYAI_API_KEY.",
        },
        { status: 400 },
      )
    }

    const transcriptionSource = await resolveTranscriptionSource({
      upload,
      language: body.language,
      override: body.override,
      useMocks,
      assemblyApiKey,
      assemblyModel,
      jobId,
      db,
    })

    if (!transcriptionSource) {
      return NextResponse.json({ error: "Failed to transcribe video" }, { status: 500 })
    }

    const { segments, transcriptText, detectedLanguage, model, rawResponse } = transcriptionSource

    const transcriptResult = await db.collection("transcripts").insertOne({
      upload_id: upload._id.toString(),
      user_id: userId,
      source_language: detectedLanguage,
      model,
      text: transcriptText,
      segments,
      words: segments.flatMap((segment) => segment.words ?? []),
      raw_payload: rawResponse ?? null,
      created_at: new Date(),
    })

    const transcriptId = transcriptResult.insertedId.toString()

    await db.collection("uploads").updateOne(
      { _id: upload._id },
      { 
        $set: { 
          status: "transcribed", 
          latest_transcript_id: transcriptId, 
          updated_at: new Date() 
        } 
      }
    )

    await db.collection("jobs").updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          status: "done",
          completed_at: new Date(),
          result: { transcriptId, segmentsCount: segments.length },
        }
      }
    )

    const previewPayload = await buildPreviewResponse({
      upload,
      transcript: {
        id: transcriptId,
        text: transcriptText,
        segments,
        source_language: detectedLanguage,
      },
      jobId,
    })

    return NextResponse.json(previewPayload)
  } catch (error) {
    console.error("Transcription error", error)
    if (error instanceof OverridePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to transcribe video" }, { status: 500 })
  }
}

async function buildPreviewResponse({
  upload,
  transcript,
  jobId,
}: {
  upload: any
  transcript: { id: string; text?: string | null; segments?: unknown; source_language?: string | null }
  jobId: string | null
}) {
  const signedUrl = getPublicUrl(upload.storage_path)
  const metadata = (upload.metadata as Record<string, unknown> | null) ?? null
  const templateId = typeof metadata?.templateId === "string" ? metadata.templateId : null
  const transcriptLanguage = transcript.source_language ?? (typeof metadata?.language === "string" ? metadata.language : null)

  return {
    jobId,
    upload: {
      id: upload._id.toString(),
      title: deriveUploadTitle(upload.file_name, metadata),
      fileName: upload.file_name,
      metadata,
      templateId,
      language: transcriptLanguage ?? null,
    },
    video: {
      url: signedUrl,
      storagePath: upload.storage_path,
      mimeType: upload.mime_type,
      durationSeconds: upload.duration_seconds,
    },
    transcript: {
      id: transcript.id,
      text: transcript.text ?? "",
      language: transcriptLanguage ?? null,
      segments: ((transcript.segments as CaptionSegment[] | null) ?? []),
    },
  }
}

// Removed ensureSignedUploadUrl - using getPublicUrl from oracle-storage instead

function deriveUploadTitle(fileName: string | null, metadata: Record<string, unknown> | null) {
  if (metadata && typeof metadata.title === "string" && metadata.title.trim().length) {
    return metadata.title.trim()
  }
  if (fileName) {
    return fileName
  }
  return "Untitled video"
}

function normalizeSegments(
  rawSegments: TranscriptSegment[],
  globalWords?: TranscriptWord[],
  options?: { globalWordsNormalized?: boolean },
): CaptionSegment[] {
  const normalizedGlobalWords = options?.globalWordsNormalized
    ? (globalWords?.length ? globalWords : undefined)
    : globalWords?.length
      ? normalizeChunkWordList(globalWords)
      : undefined
  const hasGlobalWords = Boolean(normalizedGlobalWords?.length)
  const globalWordCount = normalizedGlobalWords?.length ?? 0
  let wordCursor = 0
  let previousSegmentEnd = 0

  return rawSegments.map((segment, index) => {
    const segmentStartRaw = Number.isFinite(segment.start) ? Number(segment.start) : 0
    const rawEnd = Number.isFinite(segment.end) ? Number(segment.end) : segmentStartRaw
    const minimumEnd = segmentStartRaw + Math.max(segment.text?.length ?? 1, 1) * 0.04

    let segmentStart = roundTime(Math.max(segmentStartRaw, previousSegmentEnd))
    let segmentEnd = roundTime(Math.max(rawEnd, minimumEnd))
    if (segmentEnd <= segmentStart) {
      segmentEnd = roundTime(segmentStart + MIN_SEGMENT_DURATION)
    }
    const text = segment.text?.trim() ?? ""

    let sourceWords: TranscriptSegment["words"] | null = segment.words?.length
      ? normalizeSegmentWordList(segment.words, segmentStart, segmentEnd)
      : null
    if ((!sourceWords || !sourceWords.length) && hasGlobalWords) {
      const slice: TranscriptSegment["words"] = []
      while (wordCursor < globalWordCount) {
        const word = normalizedGlobalWords![wordCursor]
        if (word.end <= segmentStart - 0.05) {
          wordCursor += 1
          continue
        }
        if (word.start >= segmentEnd + 0.05) {
          break
        }
        slice.push({ start: word.start, end: word.end, word: word.word })
        wordCursor += 1
      }
      if (slice.length) {
        sourceWords = slice
      }
    }

    const normalizedWords = buildWordTimeline(
      sourceWords ?? null,
      text,
      segmentStart,
      segmentEnd,
    )

    const finalWordEnd = normalizedWords.at(-1)?.end ?? segmentEnd
    if (finalWordEnd > segmentEnd) {
      segmentEnd = roundTime(finalWordEnd)
    }
    if (segmentEnd - segmentStart < MIN_SEGMENT_DURATION) {
      segmentEnd = roundTime(segmentStart + MIN_SEGMENT_DURATION)
    }

    previousSegmentEnd = segmentEnd

    return {
      id: `segment_${segment.id ?? index}`,
      start: segmentStart,
      end: segmentEnd,
      text,
      words: normalizedWords,
    }
  })
}

async function resolveTranscriptionSource({
  upload,
  language,
  override,
  useMocks,
  assemblyApiKey,
  assemblyModel,
  jobId,
  db,
}: {
  upload: any
  language?: string
  override?: z.infer<typeof requestSchema>["override"]
  useMocks: boolean
  assemblyApiKey: string | null
  assemblyModel?: string | null
  jobId: string
  db: Awaited<ReturnType<typeof getDb>>
}): Promise<
  | {
      segments: CaptionSegment[]
      transcriptText: string
      detectedLanguage: string | null
      model: string
      rawResponse: Record<string, any> | null
    }
  | null
> {
  if (override) {
    return buildOverrideTranscription(override)
  }

  if (useMocks) {
    return mockTranscription(upload.file_name ?? "demo.mp4")
  }

  if (!assemblyApiKey) {
    await markJobFailed(db, jobId, "No transcription provider configured")
    return null
  }

  try {
    // Download video from Oracle storage
    const videoStream = await downloadFile(upload.storage_path)
    const chunks: Uint8Array[] = []
    
    const reader = videoStream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    const videoBuffer = Buffer.concat(chunks)
    const fileName = upload.file_name ?? "upload.mp4"
    const mimeType = upload.mime_type ?? "video/mp4"
    
    let transcriptionPayload: TranscriptionPayload | null = null
    try {
      transcriptionPayload = await transcribeWithAssemblyAI({
        audioBuffer: videoBuffer,
        fileName,
        mimeType,
        language,
        assemblyApiKey,
        model: assemblyModel,
      })
    } catch (error) {
      console.error("AssemblyAI transcription failure", error)
      await markJobFailed(
        db,
        jobId,
        error instanceof Error ? error.message : "AssemblyAI transcription failed",
      )
      return null
    }

    if (!transcriptionPayload) {
      await markJobFailed(db, jobId, "Transcription provider failed")
      return null
    }

    return buildTranscriptionResponse({
      payload: transcriptionPayload,
      fallbackLanguage: language,
      model: transcriptionPayload.model ?? assemblyModel ?? "assemblyai",
    })
  } catch (error) {
    console.error("Failed to download video from Oracle storage", error)
    await markJobFailed(db, jobId, "Could not fetch uploaded video")
    return null
  }
}

function buildOverrideTranscription(override: NonNullable<z.infer<typeof requestSchema>["override"]>) {
  if (!override.rawResponse && !override.segments?.length && !override.text) {
    throw new OverridePayloadError("Override payload must include rawResponse, segments, or text.")
  }

  if (override.rawResponse) {
    const normalized = normalizeOverridePayload(override.rawResponse as Record<string, any>)
    const overrideWords = normalizeChunkWordList((normalized.words as TranscriptWord[]) ?? [])
    const segments = normalizeSegments((normalized.segments as TranscriptSegment[]) ?? [], overrideWords, {
      globalWordsNormalized: true,
    })
    const transcriptText = override.text ?? normalized.text ?? segments.map((s) => s.text).join(" ")
    if (!transcriptText.trim()) {
      throw new OverridePayloadError("Raw override is missing transcript text.")
    }
    return {
      segments,
      transcriptText,
      detectedLanguage: override.language ?? normalized.language ?? null,
      model: override.model ?? normalized.model ?? "manual-override",
      rawResponse: normalized,
    }
  }

  const segments = (override.segments ?? []).map((segment, index) => ({
    id: segment.id ?? `manual_${index}`,
    start: Number(segment.start ?? index * 2),
    end: Number(segment.end ?? index * 2 + 1.5),
    text: segment.text,
    words: segment.words?.map((word, wordIndex) => ({
      start: Number(word.start ?? segment.start ?? index * 2),
      end: Number(word.end ?? segment.end ?? index * 2 + 0.5),
      text: word.text,
    })),
  }))

  const transcriptText = override.text ?? segments.map((s) => s.text).join(" ")
  if (!transcriptText.trim()) {
    throw new OverridePayloadError("Manual override requires non-empty transcript text.")
  }
  const normalizedSegments = segments.length > 0 ? segments : buildSegmentsFromPlainText(transcriptText)

  return {
    segments: normalizedSegments,
    transcriptText,
    detectedLanguage: override.language ?? null,
    model: override.model ?? "manual-override",
    rawResponse: {
      text: transcriptText,
      language: override.language ?? null,
      model: override.model ?? "manual-override",
      segments: normalizedSegments,
    },
  }
}

function buildSegmentsFromPlainText(text: string): CaptionSegment[] {
  if (!text.trim()) {
    return [
      {
        id: "segment_0",
        start: 0,
        end: 2,
        text: "(empty transcript)",
      },
    ]
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  return sentences.map((sentence, index) => ({
    id: `segment_${index}`,
    start: index * 2,
    end: index * 2 + Math.max(sentence.length / 12, 1.5),
    text: sentence.trim(),
  }))
}

function buildSegmentsFromWordStream(words: TranscriptWord[]): TranscriptSegment[] {
  if (!words.length) return []

  const segments: TranscriptSegment[] = []
  let currentWords: TranscriptWord[] = []
  let segmentStart = words[0].start

  const flush = () => {
    if (!currentWords.length) return
    const startTime = segmentStart
    const endTime = currentWords.at(-1)?.end ?? startTime
    const text = currentWords.map((word) => word.word).join(" ").replace(/\s+/g, " ").trim()
    segments.push({
      id: segments.length,
      start: roundTime(startTime),
      end: roundTime(endTime),
      text,
      words: currentWords.map((word) => ({ ...word })),
    })
    currentWords = []
  }

  words.forEach((word, index) => {
    if (!currentWords.length) {
      segmentStart = word.start
    }

    currentWords.push(word)
    const next = words[index + 1]
    const duration = word.end - segmentStart
    const longGap = next ? next.start - word.end > 1.2 : true
    const punctuationBreak = /[.!?]/.test(word.word.at(-1) ?? "")
    const maxDurationReached = duration >= MAX_SEGMENT_DURATION
    const maxWordsReached = currentWords.length >= MAX_SEGMENT_WORDS

    if (punctuationBreak || maxDurationReached || maxWordsReached || longGap || index === words.length - 1) {
      flush()
    }
  })

  return segments
}

type TranscriptionPayload = {
  segments?: TranscriptSegment[]
  text?: string
  language?: string | null
  model?: string | null
  words?: TranscriptWord[]
  raw?: Record<string, any> | null
} | null

async function transcribeWithAssemblyAI({
  audioBuffer,
  fileName,
  mimeType,
  language,
  assemblyApiKey,
  model,
}: {
  audioBuffer: Buffer
  fileName: string
  mimeType: string
  language?: string
  assemblyApiKey: string
  model?: string | null
}): Promise<TranscriptionPayload> {
  const uploadUrl = await uploadFileToAssemblyAI(audioBuffer, assemblyApiKey)
  const transcriptId = await createAssemblyTranscript({
    audioUrl: uploadUrl,
    assemblyApiKey,
    language,
    model,
    originalFileName: fileName,
    mimeType,
  })
  const transcript = await pollAssemblyTranscript(transcriptId, assemblyApiKey)

  const normalizedWords: TranscriptWord[] = Array.isArray(transcript.words)
    ? (transcript.words as Array<Record<string, any>>)
        .map<TranscriptWord | null>((word) => {
          const text = String(word.text ?? word.word ?? "").trim()
          const start = Number(word.start)
          const end = Number(word.end)
          if (!text || !Number.isFinite(start) || !Number.isFinite(end)) {
            return null
          }
          return {
            start: roundTime(start / 1000, 3),
            end: roundTime(end / 1000, 3),
            word: text,
          }
        })
        .filter((word): word is TranscriptWord => Boolean(word))
    : []

  const normalizedSegments = buildSegmentsFromWordStream(normalizedWords)

  return {
    segments: normalizedSegments,
    text: transcript.text ?? normalizedSegments.map((segment: TranscriptSegment) => segment.text).join(" "),
    language: transcript.language_code ?? transcript.language ?? language ?? null,
    model: transcript.model ?? model ?? "assemblyai",
    words: normalizedWords,
    raw: transcript,
  }
}

async function uploadFileToAssemblyAI(buffer: Buffer, assemblyApiKey: string) {
  const response = await fetch(`${ASSEMBLYAI_API_BASE}/upload`, {
    method: "POST",
    headers: {
      authorization: assemblyApiKey,
      ...ASSEMBLYAI_UPLOAD_HEADERS,
    },
    body: new Uint8Array(buffer),
  })

  if (!response.ok) {
    throw new Error(`AssemblyAI upload failed: ${await response.text()}`)
  }

  const json = await response.json()
  if (!json.upload_url) {
    throw new Error("AssemblyAI upload response missing upload_url")
  }
  return json.upload_url as string
}

async function createAssemblyTranscript({
  audioUrl,
  assemblyApiKey,
  language,
  model,
  originalFileName,
  mimeType,
}: {
  audioUrl: string
  assemblyApiKey: string
  language?: string
  model?: string | null
  originalFileName: string
  mimeType?: string
}) {
  const sanitizedBody = {
    audio_url: audioUrl,
  }

  const response = await fetch(`${ASSEMBLYAI_API_BASE}/transcript`, {
    method: "POST",
    headers: {
      authorization: assemblyApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(sanitizedBody),
  })

  if (!response.ok) {
    throw new Error(`AssemblyAI transcript creation failed: ${await response.text()}`)
  }

  const json = await response.json()
  if (!json.id) {
    throw new Error("AssemblyAI transcript response missing id")
  }

  return json.id as string
}

async function pollAssemblyTranscript(id: string, assemblyApiKey: string) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < ASSEMBLYAI_MAX_POLL_DURATION_MS) {
    const response = await fetch(`${ASSEMBLYAI_API_BASE}/transcript/${id}`, {
      headers: {
        authorization: assemblyApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`AssemblyAI transcript fetch failed: ${await response.text()}`)
    }

    const json = await response.json()
    if (json.status === "completed") {
      return json
    }
    if (json.status === "error") {
      throw new Error(json.error || "AssemblyAI transcription failed")
    }

    await delay(ASSEMBLYAI_POLL_INTERVAL_MS)
  }

  throw new Error("AssemblyAI transcription timed out")
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function buildTranscriptionResponse({
  payload,
  fallbackLanguage,
  model,
}: {
  payload: NonNullable<TranscriptionPayload>
  fallbackLanguage?: string
  model: string
}) {
  const rawSegments = payload.segments ?? []
  const rawWords = payload.words ?? []
  const fallbackSegments: TranscriptSegment[] =
    !rawSegments.length && payload.text
      ? (buildSegmentsFromPlainText(payload.text).map((segment, index) => ({
          id: index,
          start: segment.start,
          end: segment.end,
          text: segment.text,
        })) as TranscriptSegment[])
      : []

  const segmentsSource = rawSegments.length ? rawSegments : fallbackSegments
  const normalizedWords = normalizeChunkWordList(rawWords)
  const segments = normalizeSegments(segmentsSource, normalizedWords, { globalWordsNormalized: true })
  const transcriptText: string = payload.text ?? segments.map((s: CaptionSegment) => s.text).join(" ")

  return {
    segments,
    transcriptText,
    detectedLanguage: payload.language ?? fallbackLanguage ?? null,
    model: payload.model ?? model,
    rawResponse: payload.raw ?? payload,
  }
}

function mockTranscription(fileName: string) {
  const segments: CaptionSegment[] = [
    {
      id: "segment_0",
      start: 0,
      end: 2.5,
      text: `Mock transcript for ${fileName} (part 1)`,
    },
    {
      id: "segment_1",
      start: 2.5,
      end: 5.5,
      text: "This is placeholder content so you can test the UI.",
    },
    {
      id: "segment_2",
      start: 5.5,
      end: 8,
      text: "Provide your own AssemblyAI response to replace this later.",
    },
  ]

  return {
    segments,
    transcriptText: segments.map((s) => s.text).join(" "),
    detectedLanguage: "en",
    model: "mock-assembly",
    rawResponse: {
      text: segments.map((s) => s.text).join(" "),
      language: "en",
      model: "mock-assembly",
      segments,
      source: "mock",
    },
  }
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

class OverridePayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OverridePayloadError"
  }
}

function normalizeOverridePayload(raw: Record<string, any>) {
  if (!raw) return raw

  if (raw.mode === "chunked" && Array.isArray(raw.chunks)) {
    let offset = 0
    const segments: TranscriptSegment[] = []
    const allWords: TranscriptWord[] = []
    const chunkTexts: string[] = []

    raw.chunks.forEach((chunk: Record<string, any>, index: number) => {
      const chunkText = typeof chunk.text === "string" ? chunk.text.trim() : ""
      if (chunkText) {
        chunkTexts.push(chunkText)
      }

      const chunkOffset = Number.isFinite(chunk?.offset) ? Number(chunk.offset) : offset
      const usageSeconds = Number(chunk?.usage?.seconds)
      const wordsSource = Array.isArray(chunk.words) ? chunk.words : []
      const normalizedChunkWords: TranscriptWord[] = []
      let earliestWord = Number.POSITIVE_INFINITY
      let latestWord = Number.NEGATIVE_INFINITY

      wordsSource.forEach((raw: Record<string, any>) => {
        const wordText = typeof raw.word === "string" ? raw.word.trim() : typeof raw.text === "string" ? raw.text.trim() : ""
        if (!wordText) return
        const relativeStart = Number(raw.start ?? raw.begin ?? raw.offset ?? 0)
        const relativeEnd = Number(raw.end ?? raw.finish ?? relativeStart)
        const start = chunkOffset + Math.max(0, relativeStart)
        const end = chunkOffset + Math.max(relativeEnd, relativeStart)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
        const normalized: TranscriptWord = {
          start: roundTime(start, 3),
          end: roundTime(end, 3),
          word: wordText,
        }
        normalizedChunkWords.push(normalized)
        allWords.push(normalized)
        earliestWord = Math.min(earliestWord, normalized.start)
        latestWord = Math.max(latestWord, normalized.end)
      })

      const chunkStart = Number.isFinite(earliestWord) ? roundTime(earliestWord) : roundTime(chunkOffset)
      const fallbackDuration = Number.isFinite(usageSeconds) && usageSeconds > 0
        ? usageSeconds
        : chunkText
          ? Math.max(chunkText.length * 0.04, MIN_SEGMENT_DURATION)
          : MIN_SEGMENT_DURATION
      const chunkEndCandidate = Number.isFinite(latestWord) && latestWord !== Number.NEGATIVE_INFINITY
        ? latestWord
        : chunkStart + fallbackDuration
      const chunkEnd = roundTime(Math.max(chunkEndCandidate, chunkStart + MIN_SEGMENT_DURATION))

      segments.push({
        id: chunk.id ?? `chunk_${index}`,
        start: chunkStart,
        end: chunkEnd,
        text: chunkText || normalizedChunkWords.map((word) => word.word).join(" ").trim(),
        words: normalizedChunkWords.length ? normalizedChunkWords : undefined,
      })

      offset = Number.isFinite(usageSeconds) && usageSeconds > 0 ? chunkOffset + usageSeconds : chunkEnd
    })

    return {
      ...raw,
      text: raw.text ?? chunkTexts.join(" ").trim(),
      segments,
      words: allWords,
    }
  }

  return raw
}

function normalizeChunkWordList(words?: TranscriptWord[]): TranscriptWord[] {
  if (!words?.length) return []

  const sorted = words
    .map((word) => ({
      start: Number.isFinite(word.start) ? Number(word.start) : undefined,
      end: Number.isFinite(word.end) ? Number(word.end) : undefined,
      word: String((word as any).word ?? (word as any).text ?? "").trim(),
    }))
    .filter((word) => word.word && typeof word.start === "number" && typeof word.end === "number")
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))

  const normalized: TranscriptWord[] = []
  let lastEnd = 0

  sorted.forEach((word, index) => {
    let start = word.start ?? lastEnd
    let end = word.end ?? start

    if (end <= start) {
      return
    }

    if (index > 0) {
      if (start < lastEnd) {
        start = lastEnd
      }
      const gap = start - lastEnd
      if (gap > MAX_SILENCE_GAP) {
        start = roundTime(lastEnd + MAX_SILENCE_GAP, 3)
      }
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return
    }

    if (end - start < MIN_WORD_DURATION) {
      end = start + MIN_WORD_DURATION
    }

    start = roundTime(Math.max(0, start), 3)
    end = roundTime(Math.max(end, start + MIN_WORD_DURATION), 3)

    if (end <= start) {
      return
    }

    normalized.push({ start, end, word: word.word })
    lastEnd = end
  })

  return normalized
}

function normalizeSegmentWordList(
  words: TranscriptSegment["words"],
  segmentStart: number,
  segmentEnd: number,
): TranscriptSegment["words"] {
  if (!words?.length) return []

  const normalizedChunkWords = normalizeChunkWordList(words)
  const bounded: TranscriptSegment["words"] = []

  normalizedChunkWords.forEach((word) => {
    let start = Math.max(segmentStart, word.start)
    if (start < segmentStart) start = segmentStart
    let end = Math.min(segmentEnd, word.end)
    if (end > segmentEnd) end = segmentEnd

    if (start < segmentStart) {
      start = segmentStart
    }

    if (end - start < MIN_WORD_DURATION) {
      end = Math.min(segmentEnd, start + MIN_WORD_DURATION)
    }

    start = roundTime(start, 3)
    end = roundTime(end, 3)

    if (end > start) {
      bounded.push({ start, end, word: word.word })
    }
  })

  return bounded
}

function buildWordTimeline(
  rawWords: TranscriptSegment["words"] | null,
  fallbackText: string,
  segmentStart: number,
  segmentEnd: number,
) {
  const sanitized: Array<{ start?: number; end?: number; text: string }> = []

  rawWords?.forEach((word) => {
    const text = word.word?.trim()
    if (!text) return
    const start = Number.isFinite(word.start) ? Number(word.start) : undefined
    const end = Number.isFinite(word.end) ? Number(word.end) : undefined
    sanitized.push({ start, end, text })
  })

  if (!sanitized.length) {
    return distributeWordsEvenly(fallbackText, segmentStart, segmentEnd)
  }

  sanitized.sort((a, b) => (a.start ?? segmentStart) - (b.start ?? segmentStart))

  const normalized: Array<{ start: number; end: number; text: string }> = []
  let cursor = segmentStart

  sanitized.forEach((word, index) => {
    const previous = normalized.at(-1)

    let start = roundTime(word.start ?? cursor)
    if (start < segmentStart) start = segmentStart
    if (start < cursor) start = cursor

    let desiredEnd = Number.isFinite(word.end) ? Number(word.end) : start + MIN_WORD_DURATION
    if (desiredEnd <= start) {
      desiredEnd = start + MIN_WORD_DURATION
    }

    let end = roundTime(desiredEnd)

    if (previous) {
      const gap = start - previous.end
      if (gap < 0) {
        start = roundTime(previous.end)
      } else if (gap > MAX_SILENCE_GAP) {
        // keep some pause but cap it so captions don't drift too far
        start = roundTime(previous.end + Math.min(gap, MAX_SILENCE_GAP))
      }
    }

    if (end <= start) {
      end = roundTime(start + MIN_WORD_DURATION)
    }

    if (end - start < MIN_WORD_DURATION) {
      end = roundTime(start + MIN_WORD_DURATION)
    }

    if (end > segmentEnd) {
      end = segmentEnd
    }

    if (index === sanitized.length - 1 && end < segmentEnd) {
      end = segmentEnd
    }

    normalized.push({ start, end, text: word.text })

    cursor = end
  })

  return normalized
}

function distributeWordsEvenly(text: string, start: number, end: number) {
  const tokens = text.split(/\s+/).map((token) => token.trim()).filter(Boolean)
  if (!tokens.length) {
    return []
  }

  const baseDuration = end > start ? end - start : 0
  const safeDuration = Math.max(baseDuration, tokens.length * MIN_WORD_DURATION)
  const perWord = safeDuration / tokens.length
  let cursor = start

  return tokens.map((token, index) => {
    const wordStart = cursor
    const wordEnd = index === tokens.length - 1 ? start + safeDuration : wordStart + perWord
    cursor = wordEnd
    return {
      start: roundTime(wordStart),
      end: roundTime(wordEnd),
      text: token,
    }
  })
}

function roundTime(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(decimals))
}
