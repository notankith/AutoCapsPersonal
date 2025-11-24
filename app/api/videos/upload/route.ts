import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RETENTION_WINDOW_DAYS, STORAGE_BUCKETS } from "@/lib/pipeline"
import { z } from "zod"
import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

const requestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json())
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const uploadId = uuidv4()
    const sanitizedName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
    const requestedPath = `${user.id}/${uploadId}/${sanitizedName}`
    const expiresAt = typeof RETENTION_WINDOW_DAYS === "number"
      ? new Date(Date.now() + RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: signedUpload, error: signedError } = await admin
      .storage
      .from(STORAGE_BUCKETS.uploads)
      .createSignedUploadUrl(requestedPath)

    if (signedError || !signedUpload) {
      console.error("Failed to issue signed upload URL", signedError)
      return NextResponse.json({ error: "Could not prepare upload" }, { status: 500 })
    }

    const rawPath = signedUpload.path ?? requestedPath
    const bucketPrefix = `${STORAGE_BUCKETS.uploads}/`
    const storagePath = rawPath.startsWith(bucketPrefix) ? rawPath.slice(bucketPrefix.length) : rawPath

    const { error: insertError } = await supabase.from("uploads").insert({
      id: uploadId,
      user_id: user.id,
      file_name: body.fileName,
      storage_path: storagePath,
      mime_type: body.fileType,
      file_size: body.fileSize ?? null,
      duration_seconds: body.durationSeconds ?? null,
      metadata: body.metadata ?? null,
      status: "pending_upload",
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error("Failed to persist upload metadata", insertError)
      return NextResponse.json({ error: "Failed to track upload" }, { status: 500 })
    }

    return NextResponse.json({
      uploadId,
      path: storagePath,
      uploadUrl: signedUpload.signedUrl,
      storagePath,
      token: signedUpload.token,
      expiresAt,
      bucket: STORAGE_BUCKETS.uploads,
    })
  } catch (error) {
    console.error("Upload preparation error", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
