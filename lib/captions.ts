import { CaptionSegment, CaptionTemplate as CaptionTemplateId } from "@/lib/pipeline"
import { Templates } from "@/components/templates/data"
import { generateASS, toAssColor } from "@/components/templates/utils"
import { CaptionTemplate } from "@/components/templates/types"

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`

const ASS_EVENTS_HEADER = `

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

const CREATOR_KINETIC_MAX_WORDS_PER_LINE = 4
const CREATOR_KINETIC_MAX_LINES_PER_CHUNK = 2
type SegmentWord = NonNullable<CaptionSegment["words"]>[number]

export type CaptionFile = {
  format: "srt" | "ass"
  template: CaptionTemplateId
  content: string
}

export function buildCaptionFile(templateId: CaptionTemplateId, segments: CaptionSegment[]): CaptionFile {
  let normalized = ensureWordTimings(segments)
  // Optionally clamp segment end times if a duration is provided
  if (typeof segments !== "undefined" && segments.length > 0) {
    const maxEnd = Math.max(...segments.map(s => s.end))
    // If segments extend past video duration, clamp them
    if (typeof (global as any).videoDuration === "number" && maxEnd > (global as any).videoDuration) {
      normalized = normalized.map(seg => ({
        ...seg,
        end: Math.min(seg.end, (global as any).videoDuration)
      }))
    }
  }
  const template = Templates[templateId]

  if (!template) {
    // Fallback for unknown templates or if not in Templates map
    return { format: "srt", template: templateId, content: toSrt(normalized) }
  }

  // Generate ASS for all defined templates
  const content = generateAssFile(template, normalized)
  return { format: "ass", template: templateId, content }
}

function generateAssFile(template: CaptionTemplate, segments: CaptionSegment[]): string {
  const styleLine = generateASS(template)
  
  let events = ""
  if (template.karaoke) {
    events = generateKaraokeEvents(template, segments)
  } else {
    events = generateSimpleEvents(template, segments)
  }

  return `${ASS_HEADER}\n${styleLine}${ASS_EVENTS_HEADER}\n${events}`
}

function generateSimpleEvents(template: CaptionTemplate, segments: CaptionSegment[]): string {
  return segments
    .map((seg) =>
      `Dialogue: 0,${formatAssTimestamp(seg.start)},${formatAssTimestamp(seg.end)},${template.name},,0,0,0,,${escapeAssText(
        seg.text.trim(),
      )}`,
    )
    .join("\n")
}

function generateKaraokeEvents(template: CaptionTemplate, segments: CaptionSegment[]): string {
  // Build the highlight color array; allow cycling if highlightColors is provided
  const highlightColors = template.karaoke?.highlightColors ?? (template.karaoke?.highlightColor ? [template.karaoke.highlightColor] : ["#FFFF00"]) 
  const cycleAfter = template.karaoke?.cycleAfterChunks ?? 2
  const baseColorAss = toAssColor(template.primaryColor)
  const outlineColorAss = toAssColor(template.outlineColor)

  let globalChunkIndex = 0
  return segments
    .map((segment) => {
      if (!segment.words?.length) return "" // Skip or handle empty words

      // group words: max 3 per line, max 2 lines
      const words = segment.words as SegmentWord[]
      const chunks: SegmentWord[][] = []
      let chunk: SegmentWord[] = []
      words.forEach((w, i) => {
        chunk.push(w)
        if (chunk.length === 3 || i === words.length - 1) {
          chunks.push(chunk)
          chunk = []
        }
      })

      return chunks
        .map((chunk, ci) => {
          const chunkStart = chunk[0].start
          const chunkEnd = chunk[chunk.length - 1].end

          const chunkZoomIn = `\\t(0,80,\\fscx105\\fscy105)\\t(80,160,\\fscx100\\fscy100)`

          // decide color for this chunk based on globalChunkIndex and cycle size
          const colorIndex = Math.floor(globalChunkIndex / cycleAfter) % highlightColors.length
          const highlightColorAss = toAssColor(highlightColors[colorIndex])

          const sentence = chunk
            .map((word) => {
              const rel = Math.round((word.start - chunkStart) * 1000)
              const dur = Math.max(10, Math.round((word.end - word.start) * 1000))
              const highlightEnd = rel + dur

              const txt = escapeAssText(word.text.toUpperCase())
              // Use template colors
              const base = `\\1c${baseColorAss}\\3c${outlineColorAss}\\3a&H00&\\bord${template.outlineWidth}\\blur0\\fscx100\\fscy100`
              const highlightStart = rel
              const highlight = `\\t(${highlightStart},${highlightStart + 1},\\1c${highlightColorAss})`
              const reset = `\\t(${highlightEnd},${highlightEnd + 1},\\1c${baseColorAss})`

              return `{${chunkZoomIn}${base}${highlight}${reset}}${txt}`
            })
            .join(" ")

          const lineBreak = ci === 0 ? "" : "\\N"
          globalChunkIndex++
          return `Dialogue: 0,${formatAssTimestamp(chunkStart)},${formatAssTimestamp(chunkEnd)},${template.name},,0,0,0,,${lineBreak}${sentence}`
        })
        .join("\n")
    })
    .join("\n")
}



// -----------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------


function toSrt(segs: CaptionSegment[]): string {
  return segs
    .map((segment, index) => `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${segment.text.trim()}\n`)
    .join("\n")
}

function formatSrtTimestamp(seconds: number) {
  const d = new Date(seconds * 1000)
  return d.toISOString().slice(11, 23).replace(".", ",")
}

function formatAssTimestamp(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}`
}

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

function escapeAssText(text: string) {
  return text.replace(/\{/g, "(").replace(/\}/g, ")")
}

function chunkWordsForCenter(words: NonNullable<CaptionSegment["words"]>): NonNullable<CaptionSegment["words"]>[] {
  if (!words.length) return []

  const chunkSize = CREATOR_KINETIC_MAX_WORDS_PER_LINE * CREATOR_KINETIC_MAX_LINES_PER_CHUNK
  const chunks: NonNullable<CaptionSegment["words"]>[] = []

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize))
  }

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]
    if (last.length === 1) {
      const previous = chunks[chunks.length - 2]
      if (previous.length > 1) {
        last.unshift(previous.pop()!)
      }
    }
  }

  return chunks
}

function ensureWordTimings(segments: CaptionSegment[]): CaptionSegment[] {
  return segments.map((segment) => {
    if (segment.words?.length) return segment

    const tokens = segment.text?.split(/\s+/).filter(Boolean) ?? []
    if (!tokens.length) {
      return { ...segment, words: [] }
    }

    const start = segment.start
    const end = segment.end || start + Math.max(tokens.length * 0.25, 0.5)
    const per = (end - start) / tokens.length
    let cursor = start

    const words = tokens.map((token, index) => {
      const wordStart = cursor
      const wordEnd = index === tokens.length - 1 ? end : wordStart + per
      cursor = wordEnd
      return { start: wordStart, end: wordEnd, text: token }
    })

    return { ...segment, words }
  })
}
