import { getDb } from "@/lib/mongodb"
import { getPublicUrl } from "@/lib/oracle-storage"
import { RETENTION_WINDOW_DAYS, STORAGE_PREFIX } from "@/lib/pipeline"
import { z } from "zod"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || process.env.WORKER_JWT_SECRET || "default-secret-key-change-me"

const requestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
  userId: z.string().optional(), // Temporary: pass userId from client until auth is implemented
})

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json())
    const db = await getDb()

    // Get userId from token if available, otherwise fallback to body or default
    let userId = body.userId || "default-user"
    const token = request.cookies.get("auth_token")?.value
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
        userId = decoded.userId
      } catch (e) {
        // Invalid token, ignore
      }
    }

    const uploadId = new ObjectId().toString()
    const sanitizedName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = `${STORAGE_PREFIX.uploads}/${userId}/${uploadId}/${sanitizedName}`
    const expiresAt = typeof RETENTION_WINDOW_DAYS === "number"
      ? new Date(Date.now() + RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      : null

    // Get Oracle Object Storage public URL
    const uploadUrl = getPublicUrl(storagePath)

    // Insert upload metadata into MongoDB
    const uploadDoc = {
      _id: new ObjectId(uploadId),
      user_id: userId,
      file_name: body.fileName,
      storage_path: storagePath,
      mime_type: body.fileType,
      file_size: body.fileSize ?? null,
      duration_seconds: body.durationSeconds ?? null,
      metadata: body.metadata ?? null,
      status: "pending_upload",
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date(),
    }

    const result = await db.collection("uploads").insertOne(uploadDoc)
    
    if (!result.acknowledged) {
      console.error("Failed to persist upload metadata")
      return NextResponse.json({ error: "Failed to track upload" }, { status: 500 })
    }

    return NextResponse.json({
      uploadId,
      path: storagePath,
      uploadUrl, // Direct PUT URL to Oracle Object Storage
      storagePath,
      expiresAt,
    })
  } catch (error) {
    console.error("Upload preparation error", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
