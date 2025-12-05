import { CaptionSegment, CaptionTemplate as CaptionTemplateId } from "@/lib/pipeline"
import { Templates } from "@/components/templates/data"
import { generateASS, toAssColor } from "@/components/templates/utils"
import { CaptionTemplate } from "@/components/templates/types"

function getAssHeader(playResX = 1920, playResY = 1080) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`
}

const ASS_EVENTS_HEADER = `

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

const CREATOR_KINETIC_MAX_WORDS_PER_LINE = 4
const CREATOR_KINETIC_MAX_LINES_PER_CHUNK = 2
const CREATOR_KINETIC_MAX_CHARS_PER_LINE = 25 // New constraint
type SegmentWord = NonNullable<CaptionSegment["words"]>[number]

export type CaptionFile = {
  format: "srt" | "ass"
  template: CaptionTemplateId
  content: string
}

export function buildCaptionFile(
  templateId: CaptionTemplateId, 
  segments: CaptionSegment[],
  customStyles?: { fontSize?: number; marginV?: number; alignment?: number; playResX?: number; playResY?: number }
): CaptionFile {
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
  const baseTemplate = Templates[templateId]

  if (!baseTemplate) {
    // Fallback for unknown templates or if not in Templates map
    return { format: "srt", template: templateId, content: toSrt(normalized) }
  }

  // Merge custom styles
  const template = { ...baseTemplate, ...customStyles }

  // Generate ASS for all defined templates
  const content = generateAssFile(template, normalized, customStyles?.playResX, customStyles?.playResY)
  return { format: "ass", template: templateId, content }
}

function generateAssFile(template: CaptionTemplate, segments: CaptionSegment[], playResX?: number, playResY?: number): string {
  const styleLine = generateASS(template)
  
  let events = ""
  if (template.karaoke) {
    events = generateKaraokeEvents(template, segments)
  } else {
    events = generateSimpleEvents(template, segments)
  }

  return `${getAssHeader(playResX, playResY)}\n${styleLine}${ASS_EVENTS_HEADER}\n${events}`
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
  const highlightColors =
    template.karaoke?.highlightColors ??
    (template.karaoke?.highlightColor ? [template.karaoke.highlightColor] : ["#FFFF00"]);
  const cycleAfter = template.karaoke?.cycleAfterChunks ?? 2;

  const baseColorAss = toAssColor(template.primaryColor);

  let globalChunkIndex = 0;

  return segments
    .map((segment) => {
      if (!segment.words?.length) return "";

      const words = segment.words as SegmentWord[];

      // Break into lines first (keeps word groupings stable per line)
      const lines: SegmentWord[][] = [];
      let currentLine: SegmentWord[] = [];
      words.forEach((word, idx) => {
        currentLine.push(word);
        const reachedLimit = currentLine.length >= CREATOR_KINETIC_MAX_WORDS_PER_LINE;
        const atEnd = idx === words.length - 1;
        if (reachedLimit || atEnd) {
          lines.push(currentLine);
          currentLine = [];
        }
      });

      if (currentLine.length) {
        lines.push(currentLine);
      }

      // Group lines into chunks of up to two lines so both render simultaneously
      const chunkedLines: SegmentWord[][][] = [];
      for (let i = 0; i < lines.length; i += CREATOR_KINETIC_MAX_LINES_PER_CHUNK) {
        chunkedLines.push(lines.slice(i, i + CREATOR_KINETIC_MAX_LINES_PER_CHUNK));
      }

      return chunkedLines
        .map((chunkLines) => {
          const chunkStart = chunkLines[0][0].start;
          const lastLine = chunkLines[chunkLines.length - 1];
          const chunkEnd = lastLine[lastLine.length - 1].end;

          const chunkZoomIn = `\\fscx80\\fscy80\\t(0,50,\\fscx100\\fscy100)`;
          const colorIndex = Math.floor(globalChunkIndex / cycleAfter) % highlightColors.length;
          const highlightColorAss = toAssColor(highlightColors[colorIndex]);

          const renderedLines = chunkLines
            .map((lineWords) => {
              return lineWords
                .map((word) => {
                  const rel = Math.round((word.start - chunkStart) * 1000);
                  const dur = Math.max(10, Math.round((word.end - word.start) * 1000));
                  const highlightEnd = rel + dur;
                  const txt = escapeAssText(word.text.toUpperCase());

                  // Crisp text with subtle black outline
                  const base = `\\1c${baseColorAss}\\3c&H000000&\\bord0.6\\blur0.4\\shad0.15`;

                  const highlight = `\\t(${rel},${rel + 50},\\1c${highlightColorAss})`;
                  const reset = `\\t(${highlightEnd},${highlightEnd + 50},\\1c${baseColorAss})`;

                  return `{${chunkZoomIn}${base}${highlight}${reset}}${txt}`;
                })
                .join(" ");
            })
            .join("\\N");

          const glowLines = chunkLines
            .map((lineWords) => {
              return lineWords
                .map((word) => {
                  const rel = Math.round((word.start - chunkStart) * 1000);
                  const dur = Math.max(10, Math.round((word.end - word.start) * 1000));
                  const highlightEnd = rel + dur;
                  const txt = escapeAssText(word.text.toUpperCase());

                  // Stronger glow layer: Higher opacity (lower hex) and wider blur
                  // &H60& is ~37% transparent (63% opaque), &H30& is ~19% transparent (81% opaque)
                  const base = `\\alpha&H60&\\1c${highlightColorAss}\\bord0\\blur10\\shad0`;
                  const activate = `\\t(${rel},${rel + 50},\\alpha&H30&)`;
                  const deactivate = `\\t(${highlightEnd},${highlightEnd + 80},\\alpha&H60&)`;

                  return `{${chunkZoomIn}${base}${activate}${deactivate}}${txt}`;
                })
                .join(" ");
            })
            .join("\\N");

          globalChunkIndex++;

          // Layer 0: Glow (Stronger)
          const glowDialogue = `Dialogue: 0,${formatAssTimestamp(chunkStart)},${formatAssTimestamp(
            chunkEnd
          )},${template.name},,0,0,0,,${glowLines}`;

          // Layer 1: Core Text (White/Primary)
          const coreDialogue = `Dialogue: 1,${formatAssTimestamp(chunkStart)},${formatAssTimestamp(
            chunkEnd
          )},${template.name},,0,0,0,,${renderedLines}`;

          return `${glowDialogue}\n${coreDialogue}`;
        })
        .join("\n");
    })
    .join("\n");
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

  const chunks: NonNullable<CaptionSegment["words"]>[] = []
  let currentChunk: NonNullable<CaptionSegment["words"]> = []
  let currentLineLength = 0
  let currentLines = 1

  for (const word of words) {
    const wordLen = word.text.length
    
    // Check if adding this word exceeds line length limit
    if (currentLineLength + wordLen > CREATOR_KINETIC_MAX_CHARS_PER_LINE) {
      // If we are already at max lines, push chunk and start new
      if (currentLines >= CREATOR_KINETIC_MAX_LINES_PER_CHUNK) {
        chunks.push(currentChunk)
        currentChunk = [word]
        currentLineLength = wordLen
        currentLines = 1
      } else {
        // Start new line in same chunk
        currentChunk.push(word)
        currentLineLength = wordLen
        currentLines++
      }
    } else {
      // Add to current line
      currentChunk.push(word)
      currentLineLength += wordLen + 1 // +1 for space
      
      // Check word count limit per chunk
      if (currentChunk.length >= CREATOR_KINETIC_MAX_WORDS_PER_LINE * CREATOR_KINETIC_MAX_LINES_PER_CHUNK) {
        chunks.push(currentChunk)
        currentChunk = []
        currentLineLength = 0
        currentLines = 1
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  // Balance orphans
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
