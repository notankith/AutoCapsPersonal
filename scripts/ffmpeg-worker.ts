import { createServer } from "node:http"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import jwt from "jsonwebtoken"
import { createClient, type PostgrestError } from "@supabase/supabase-js"
import { STORAGE_BUCKETS, RENDER_RESOLUTIONS, type CaptionTemplate } from "@/lib/pipeline"
import "dotenv/config"

// FINAL AND ONLY FFmpeg BINARY
const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg"
const CREATOR_KINETIC_FONT_PATH =
  "D:\\VSCode Projects\\autocapsuiux-main\\RetroDream-DisplayFreeDemo.ttf"
const CREATOR_KINETIC_FONT_DIR = dirname(CREATOR_KINETIC_FONT_PATH)

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

    console.log("[worker] Downloaded inputs, launching FFmpeg", { jobId })
    await runFfmpeg(
      videoTmp,
      captionTmp,
      outputTmp,
      payload.captionFormat,
      payload.template,
      `${resolution.width}x${resolution.height}`
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
) {
  const forceStyle =
    template === "minimal"
      ? "Fontname=Inter,Fontsize=40,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BackColour=&H64000000&,BorderStyle=4"
      : null

  const escapedCaptions = escapeFilterPath(captions)
  const escapedFontsDir = escapeFilterPath(CREATOR_KINETIC_FONT_DIR)

  const filter = (() => {
    const baseFilters: string[] = []
    if (fmt === "ass") {
      const fontsDirParam = template === "karaoke" ? `:fontsdir=${escapedFontsDir}` : ""
      baseFilters.push(`subtitles='${escapedCaptions}${fontsDirParam}'`)
    } else if (forceStyle) {
      baseFilters.push(`subtitles='${escapedCaptions}:force_style=${forceStyle}'`)
    } else {
      baseFilters.push(`subtitles='${escapedCaptions}'`)
    }
    baseFilters.push("fps=30", "format=yuv420p")
    return baseFilters.join(",")
  })()

  const args = [
    "-y",
    "-i",
    video,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    out,
  ]

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

function escapeFilterPath(path: string) {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/ /g, "\\ ")
}

async function ensureSignedUrl(url: string | undefined, bucket: string, path: string) {
  if (url) return url
  if (!path) throw new Error("Missing storage path")

  console.log("Signing:", bucket, path)

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 4)
  if (data?.signedUrl) {
    return data.signedUrl
  }

  const pub = supabase.storage.from(bucket).getPublicUrl(path)
  if (pub.data.publicUrl) {
    return pub.data.publicUrl
  }

  throw new Error(`Unable to sign asset: ${path} (${error?.message ?? "unknown"})`)
}
