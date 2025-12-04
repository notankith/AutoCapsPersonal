import { createAdminClient } from "@/lib/supabase/admin"
import { RETENTION_WINDOW_DAYS, STORAGE_PREFIX } from "@/lib/pipeline"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (RETENTION_WINDOW_DAYS === null) {
    return NextResponse.json({ purged: 0, retention: "disabled" })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  type ExpiredUpload = {
    id: string
    storage_path: string
    caption_asset_path: string | null
    render_asset_path: string | null
  }

  const { data, error } = await admin
    .from("uploads")
    .select("id, storage_path, caption_asset_path, render_asset_path")
    .lte("expires_at", cutoff)
    .limit(200)

  if (error) {
    return NextResponse.json({ purged: 0, error: error.message }, { status: 500 })
  }

  const expiredUploads: ExpiredUpload[] = (data ?? []) as ExpiredUpload[]
  if (!expiredUploads.length) {
    return NextResponse.json({ purged: 0 })
  }

  const uploadPaths = expiredUploads.map((upload) => upload.storage_path)
  const captionPaths = expiredUploads.map((upload) => upload.caption_asset_path).filter(Boolean) as string[]
  const renderPaths = expiredUploads.map((upload) => upload.render_asset_path).filter(Boolean) as string[]

  if (uploadPaths.length) {
    await admin.storage.from(STORAGE_BUCKETS.uploads).remove(uploadPaths)
  }
  if (captionPaths.length) {
    await admin.storage.from(STORAGE_BUCKETS.captions).remove(captionPaths)
  }
  if (renderPaths.length) {
    await admin.storage.from(STORAGE_BUCKETS.renders).remove(renderPaths)
  }

  const uploadsTable = admin.from("uploads") as any
  await uploadsTable
    .update({ status: "expired" })
    .in(
      "id",
      expiredUploads.map((item) => item.id),
    )

  return NextResponse.json({ purged: expiredUploads.length })
}
