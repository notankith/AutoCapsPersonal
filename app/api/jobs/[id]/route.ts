import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  
  // TODO: Get userId from JWT token instead of hardcoding
  const userId = "default-user"

  const { id } = await context.params

  let job
  try {
    job = await db.collection("jobs").findOne({
      _id: new ObjectId(id),
    })
  } catch (error) {
    return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 })
  }

  if (!job || job.user_id !== userId) {
    console.warn("Job fetch mismatch", {
      jobId: id,
      jobUserId: job?.user_id,
      requestUserId: userId,
    })
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  let upload = null
  if (job.upload_id) {
    try {
      upload = await db.collection("uploads").findOne(
        { _id: new ObjectId(job.upload_id) },
        { projection: { _id: 1, status: 1, storage_path: 1, render_asset_path: 1 } }
      )
    } catch (error) {
      console.warn("Failed to fetch upload for job", { jobId: id, uploadId: job.upload_id })
    }
  }

  // Convert MongoDB ObjectId to string for JSON serialization
  const jobResponse = {
    ...job,
    _id: job._id.toString(),
    id: job._id.toString(), // Keep backward compatibility
  }

  const uploadResponse = upload ? {
    ...upload,
    _id: upload._id.toString(),
    id: upload._id.toString(),
  } : null

  console.log("[jobs API] Returning job status", {
    jobId: id,
    status: jobResponse.status,
    hasResult: !!jobResponse.result,
    hasDownloadUrl: !!jobResponse.result?.downloadUrl,
    downloadUrl: jobResponse.result?.downloadUrl,
  })

  return NextResponse.json({ job: jobResponse, upload: uploadResponse })
}
