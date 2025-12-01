import { createServer } from "node:http"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import jwt from "jsonwebtoken"
import { createClient, type PostgrestError } from "@supabase/supabase-js"
import { STORAGE_BUCKETS, RENDER_RESOLUTIONS, type CaptionTemplate, type RenderOverlay } from "@/lib/pipeline"
import "dotenv/config"

// FINAL AND ONLY FFmpeg BINARY
const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg"
const CREATOR_KINETIC_FONT_PATH = join(process.cwd(), "public", "fonts", "THEBOLDFONT-FREEVERSION.ttf")
const CREATOR_KINETIC_FONT_DIR = join(process.cwd(), "public", "fonts")

type RenderJobPayload = {
  jobId: string
  uploadId: string
  videoPath: string
  captionPath: string
  captionFormat: "srt" | "ass"
  template: CaptionTemplate
  resolution: keyof typeof RENDER_RESOLUTIONS | string
  outputPath: string
  videoUrl?: string
  captionUrl?: string
  overlays?: Array<{ url: string; start: number; end: number; x?: number; y?: number; width?: number; height?: number }>
}

const WORKER_SECRET = process.env.WORKER_JWT_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.FFMPEG_WORKER_PORT ?? 8787)

if (!WORKER_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing WORKER_JWT_SECRET, SUPABASE credentials")
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  const pathname = url.pathname.replace(/\/+$/, "") || "/"

  if (["/", "/health"].includes(pathname) && (req.method === "GET" || req.method === "HEAD")) {
    res.writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ status: "ok", route: pathname, timestamp: new Date().toISOString() }))
    return
  }

  if (req.method !== "POST" || pathname !== "/render") {
    res.writeHead(404).end("Not found")
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.writeHead(401).end("Missing token")
    return
  }

  try {
    jwt.verify(authHeader.replace("Bearer ", ""), WORKER_SECRET)
  } catch {
    res.writeHead(401).end("Invalid token")
    return
  }

  const body = await readBody(req)
  try {
    const payload = JSON.parse(body) as RenderJobPayload
    await processJob(payload)
    res.writeHead(202).end(JSON.stringify({ accepted: true, jobId: payload.jobId }))
  } catch (error) {
    console.error("Worker failed:", error)
    res.writeHead(500).end("Worker error")
  }
}).listen(PORT, () => {
  console.log(`FFmpeg worker listening on :${PORT}`)
})

async function processJob(payload: RenderJobPayload) {
  console.log("[worker] Received job", payload.jobId, {
    uploadId: payload.uploadId,
    videoPath: payload.videoPath,
    captionPath: payload.captionPath,
    resolution: payload.resolution,
    template: payload.template,
  })

  const jobId = payload.jobId
  const resolutionKey = resolveResolutionKey(payload.resolution)

  if (!resolutionKey) throw new Error(`Unsupported resolution: ${payload.resolution}`)
  const resolution = RENDER_RESOLUTIONS[resolutionKey]

  await updateJob(jobId, {
    status: "processing",
    started_at: new Date().toISOString(),
  })

  const videoTmp = join(tmpdir(), `${jobId}-video`)
  const captionTmp = join(tmpdir(), `${jobId}-caption`)
  const outputTmp = join(tmpdir(), `${jobId}-render.mp4`)
  // Overlay files will be downloaded into temp paths and cleaned up in finally
  let overlayFiles: Array<RenderOverlay & { path?: string }> = []
  let fontsDir: string | undefined;

  try {
    console.log("=== Getting Signed URLs ===")
    console.log("Uploads bucket:", STORAGE_BUCKETS.uploads)
    console.log("Captions bucket:", STORAGE_BUCKETS.captions)

    const [videoUrl, captionUrl] = await Promise.all([
      ensureSignedUrl(payload.videoUrl, STORAGE_BUCKETS.uploads, payload.videoPath),
      ensureSignedUrl(payload.captionUrl, STORAGE_BUCKETS.captions, payload.captionPath),
    ])

    console.log("Signed video URL:", videoUrl)
    console.log("Signed caption URL:", captionUrl)

    await downloadToFile(videoUrl, videoTmp)
    await downloadToFile(captionUrl, captionTmp)

    // Get video duration using ffprobe after video is downloaded
    const { getVideoDuration } = require("./ffprobe-helper")
    const videoDuration = getVideoDuration(videoTmp)
    console.log("[worker] Video duration:", videoDuration)

    // Clamp overlays to video duration
    if (Array.isArray(payload.overlays) && typeof videoDuration === "number") {
      payload.overlays = payload.overlays.map((ov: any) => ({
        ...ov,
        end: Math.min(ov.end, videoDuration)
      }))
    }

    // Download overlays (if any) to local temp files for ffmpeg input
    overlayFiles = []
    if (payload.overlays && payload.overlays.length) {
      for (let i = 0; i < payload.overlays.length; i++) {
        const ov = payload.overlays[i]
        try {
          // Try to derive extension from URL (default to .gif)
          const extMatch = (ov.url || "").match(/\.(gif|webp|png|mp4)(?:$|[?#])/i)
          const ext = extMatch ? extMatch[1] : "gif"
          const overlayTmp = join(tmpdir(), `${jobId}-overlay-${i}.${ext}`)
          await downloadToFile(ov.url, overlayTmp)
          overlayFiles.push({ url: ov.url, path: overlayTmp, start: ov.start, end: ov.end, x: ov.x, y: ov.y, width: ov.width, height: ov.height })
        } catch (err) {
          console.warn(`[worker] Failed to download overlay ${ov.url} — skipping`, err)
        }
      }
    }

    console.log("[worker] Downloaded inputs, launching FFmpeg", { jobId })

    // Copy font to temp directory to avoid path issues
    fontsDir = CREATOR_KINETIC_FONT_DIR
    // Check if template is karaoke (CreatorKinetic)
    if (payload.template === "karaoke") {
      try {
        // Create a unique directory for this job to avoid scanning garbage
        const uniqueFontDir = join(tmpdir(), `fonts_${jobId}`)
        await fs.mkdir(uniqueFontDir, { recursive: true })
        
        const fontName = "CustomFont.ttf" // Simple name to avoid issues
        const fontDest = join(uniqueFontDir, fontName)
        
        // Ensure we are copying from the correct source path
        const sourceFontPath = CREATOR_KINETIC_FONT_PATH
        console.log(`[worker] Copying font from ${sourceFontPath} to ${fontDest}`)
        await fs.copyFile(sourceFontPath, fontDest)
        
        fontsDir = uniqueFontDir
        console.log("[worker] Copied font to unique temp dir:", fontsDir)
      } catch (e) {
        console.warn("[worker] Failed to copy font to temp, using original path:", e)
      }
    }

    await runFfmpeg(
      videoTmp,
      captionTmp,
      outputTmp,
      payload.captionFormat,
      payload.template,
      `${resolution.width}x${resolution.height}`,
      overlayFiles,
      fontsDir
    )

    const file = await fs.readFile(outputTmp)
    console.log("[worker] Uploading render to Storage", {
      jobId,
      bucket: STORAGE_BUCKETS.renders,
      path: payload.outputPath,
      bytes: file.length,
    })
    const { error: renderUploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.renders)
      .upload(payload.outputPath, file, {
        upsert: true,
        contentType: "video/mp4",
      })

    if (renderUploadError) {
      console.error("[worker] Render upload failed", renderUploadError)
      throw new Error(`Render upload failed: ${renderUploadError.message}`)
    }

    const { data: signed } = await supabase
      .storage
      .from(STORAGE_BUCKETS.renders)
      .createSignedUrl(payload.outputPath, 86400)

    console.log("[worker] Upload complete, updating job", { jobId })
    await updateJob(jobId, {
      status: "done",
      completed_at: new Date().toISOString(),
      result: { downloadUrl: signed?.signedUrl, storagePath: payload.outputPath },
    })

    const { missingRenderColumn } = await updateUploadRenderState(payload.uploadId, {
      status: "rendered",
      render_asset_path: payload.outputPath,
      updated_at: new Date().toISOString(),
    })

    if (missingRenderColumn) {
      console.warn("[worker] uploads.render_asset_path column missing; render path stored only in job result")
    }
    console.log("[worker] Job completed", { jobId })

  } catch (err) {
    console.error("[worker] Job failed", { jobId, error: err })
    await updateJob(jobId, {
      status: "failed",
      error: (err as Error).message,
      completed_at: new Date().toISOString(),
    })

    await supabase.from("uploads").update({
      status: "render_failed",
      updated_at: new Date().toISOString(),
    }).eq("id", payload.uploadId)

    throw err
  } finally {
    await safeUnlink(videoTmp)
    await safeUnlink(captionTmp)
    await safeUnlink(outputTmp)
    // cleanup overlays
    if (Array.isArray(overlayFiles) && overlayFiles.length) {
      for (const f of overlayFiles) {
        if (f.path) await safeUnlink(f.path as string)
      }
    }
    // cleanup fonts dir if it was created in temp
    if (fontsDir && fontsDir.startsWith(tmpdir()) && fontsDir !== tmpdir()) {
      try {
        await fs.rm(fontsDir, { recursive: true, force: true })
      } catch (e) {
        console.warn("[worker] Failed to cleanup fonts dir:", e)
      }
    }
  }
}

async function updateJob(jobId: string, patch: Record<string, any>) {
  const { error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", jobId)

  if (error) {
    console.error("[worker] Job update failed", { jobId, patch, error })
    throw new Error(`Job update failed: ${error.message}`)
  }
}

async function updateUploadRenderState(
  uploadId: string,
  patch: Record<string, any>,
): Promise<{ missingRenderColumn: boolean }> {
  const attemptedPatch = { ...patch }
  const { error } = await supabase.from("uploads").update(attemptedPatch).eq("id", uploadId)

  if (!error) return { missingRenderColumn: false }

  const isMissingColumn = isMissingRenderColumnError(error)
  if (!isMissingColumn) {
    console.error("[worker] Failed to update upload row", error)
    throw new Error(`Failed to update upload row: ${error.message}`)
  }

  console.warn("[worker] uploads.render_asset_path missing in schema cache; retrying without column")
  const { render_asset_path: _ignored, ...fallbackPatch } = attemptedPatch
  const { error: fallbackError } = await supabase.from("uploads").update(fallbackPatch).eq("id", uploadId)

  if (fallbackError) {
    console.error("[worker] Upload update fallback failed", fallbackError)
    throw new Error(`Failed to update upload row (fallback): ${fallbackError.message}`)
  }

  return { missingRenderColumn: true }
}

function isMissingRenderColumnError(error: PostgrestError | null): boolean {
  if (!error) return false
  if (error.code !== "PGRST204") return false
  return /render_asset_path/.test(error.message || "")
}

function resolveResolutionKey(res: string | undefined): keyof typeof RENDER_RESOLUTIONS | null {
  if (!res) return null
  const n = String(res).toLowerCase().replace(/\s+/g, "")
  if (n in RENDER_RESOLUTIONS) return n as keyof typeof RENDER_RESOLUTIONS
  if (n === "1080") return "1080p"
  if (n === "720") return "720p"
  return null
}

async function downloadToFile(url: string, target: string) {
  const res = await fetch(url)
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Download failed: ${res.status} - ${txt}`)
  }
  const payload = new Uint8Array(await res.arrayBuffer())
  await fs.writeFile(target, payload)
}

function runFfmpeg(
  video: string,
  captions: string,
  out: string,
  fmt: "srt" | "ass",
  template: CaptionTemplate,
  _res: string,
  overlays: RenderOverlay[] = [],
  customFontsDir?: string
) {
  // Center captions in the middle of the video using ASS alignment override (align=2)
  let forceStyle =
    template === "minimal"
      ? "Fontname=Inter,Fontsize=40,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BackColour=&H64000000&,BorderStyle=4,Alignment=2"
      : "Alignment=2";

  // Force the font for Creator Kinetic (karaoke) to ensure it picks up the custom font
  if (template === "karaoke") {
    forceStyle += ",Fontname=THE BOLD FONT (FREE VERSION)";
  }

  const escapedCaptions = escapeFilterPath(captions);
  const escapedFontsDir = escapeFilterPath(customFontsDir || CREATOR_KINETIC_FONT_DIR);

  // Build subtitles filter string
  const subtitlesFilter = (() => {
    if (fmt === "ass") {
      const fontsDirParam = template === "karaoke" ? `:fontsdir=${escapedFontsDir}` : "";
      return `subtitles='${escapedCaptions}${fontsDirParam}'`;
    } else if (forceStyle) {
      return `subtitles='${escapedCaptions}:force_style=${forceStyle}'`;
    } else {
      return `subtitles='${escapedCaptions}'`;
    }
  })();
  // Always apply overlays first, then subtitles, then fps/format
  const args: string[] = [];
  if (!overlays || overlays.length === 0) {
    const filterComplex = `[0:v]fps=30,format=yuv420p[base];[base]${subtitlesFilter}[final]`;
    console.log("[worker] FFmpeg filter_complex:", filterComplex);
    try {
      const assPreview = require('fs').readFileSync(captions, 'utf-8').split('\n').slice(0, 20).join('\n');
      console.log("[worker] ASS file preview:\n", assPreview);
    } catch (e) {
      console.warn("[worker] Could not read ASS file for preview", e);
    }
    args.push(
      "-y",
      "-i", video,
      "-filter_complex", filterComplex,
      "-map", "[final]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-level", "4.1",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "18",
      "-r", "30",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      out
    );
  } else {
    args.push("-y", "-i", video);
    overlays.forEach((ov) => {
      const input = (ov as any).path ?? ov.url;
      args.push("-stream_loop", "-1", "-i", String(input));
    });
    // Build filter_complex string
    const filterParts: string[] = [];
    filterParts.push(`[0:v]fps=30,format=yuv420p[base]`);
    overlays.forEach((ov, i) => {
      const inputIndex = i + 1;
      const scaledLabel = `ovsc${i}`;
      const start = Math.max(0, ov.start);
      const end = Math.max(start, ov.end);
      // Scale GIF to 80px width
      const width = 80;
      filterParts.push(`[${inputIndex}:v] scale=${width}:-1 [${scaledLabel}]`);
      // Always position GIF at extreme left (x=0)
      let x = 0;
      let y = `(main_h/2)-(overlay_h/2)`;
      // For karaoke, center vertically; for others, position lower
      if (template !== "karaoke") {
        y = `main_h-overlay_h-120`;
      }
      const prevLabel = i === 0 ? "base" : `v${i}`;
      const outLabel = `v${i + 1}`;
      const enable = `between(t,${start},${end})`;
      filterParts.push(`[${prevLabel}][${scaledLabel}] overlay=${x}:${y}:enable='${enable}' [${outLabel}]`);
    });
    // After all overlays, apply subtitles strictly last
    const overlayFinalLabel = overlays.length ? `v${overlays.length}` : "base";
    filterParts.push(`[${overlayFinalLabel}]${subtitlesFilter}[final]`);
    const filterComplex = filterParts.join(";");

    console.log("[worker] FFmpeg filter_complex:", filterComplex);
    try {
      const assPreview = require('fs').readFileSync(captions, 'utf-8').split('\n').slice(0, 20).join('\n');
      console.log("[worker] ASS file preview:\n", assPreview);
    } catch (e) {
      console.warn("[worker] Could not read ASS file for preview", e);
    }
    args.push(
      "-filter_complex", filterComplex,
      "-map", "[final]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-level", "4.1",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "18",
      "-r", "30",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      out
    );
  }

  return new Promise<void>((resolve, reject) => {
    const ff = spawn(ffmpegBinary, args) as ChildProcessWithoutNullStreams
    ff.stderr.on("data", (chunk: Buffer) => console.log(chunk.toString()))
    ff.on("close", (code: number | null) => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited: ${code}`))))
  })
}

async function safeUnlink(path: string) {
  try { await fs.unlink(path) } catch {}
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let d = ""
    req.on("data", (c: Buffer) => (d += c))
    req.on("end", () => resolve(d))
    req.on("error", reject)
  })
}

// Helper to escape paths used inside FFmpeg filter expressions
function escapeFilterPath(path: string) {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/ /g, "\\ ")
}

// Retrieve a signed URL for a storage object if one is not already provided
async function ensureSignedUrl(url: string | undefined, bucket: string, path: string) {
  if (url) return url
  if (!path) throw new Error("Missing storage path")

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 4)
  if (data?.signedUrl) return data.signedUrl

  const pub = supabase.storage.from(bucket).getPublicUrl(path)
  if (pub.data?.publicUrl) return pub.data.publicUrl

  throw new Error(`Unable to sign asset: ${path} (${error?.message ?? "unknown"})`)
}

