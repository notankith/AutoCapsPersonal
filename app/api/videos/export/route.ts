import { type NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/mongodb"
import { getPublicUrl } from "@/lib/oracle-storage"
import { ObjectId } from "mongodb"

export async function POST(request: NextRequest) {
  try {
    const db = await getDb()
    
    // TODO: Get userId from JWT token instead of hardcoding
    const userId = "default-user"

    const { uploadId, format = "mp4", quality = "1080p", includeCaptions = true } = await request.json()

    if (!uploadId) {
      return NextResponse.json({ error: "Upload ID is required" }, { status: 400 })
    }

    // Get upload data
    let upload
    try {
      upload = await db.collection("uploads").findOne({
        _id: new ObjectId(uploadId),
        user_id: userId,
      })
    } catch (error) {
      return NextResponse.json({ error: "Invalid upload ID format" }, { status: 400 })
    }

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    // Get latest transcript for captions
    const transcript = await db.collection("transcripts")
      .find({ upload_id: uploadId, user_id: userId })
      .sort({ created_at: -1 })
      .limit(1)
      .next()

    // Create export job
    const jobResult = await db.collection("jobs").insertOne({
      upload_id: uploadId,
      user_id: userId,
      type: "export",
      status: "processing",
      payload: {
        format,
        quality,
        include_captions: includeCaptions,
        transcript_id: transcript?._id.toString(),
      },
      started_at: new Date(),
      created_at: new Date(),
    })

    const jobId = jobResult.insertedId.toString()

    // Generate download URL
    const downloadUrl = getPublicUrl(upload.storage_path)

    // Update job as completed (instant export - just provides download link)
    await db.collection("jobs").updateOne(
      { _id: jobResult.insertedId },
      {
        $set: {
          status: "completed",
          completed_at: new Date(),
          result: {
            download_url: downloadUrl,
            format,
            quality,
            file_size: upload.file_size,
          },
        }
      }
    )

    return NextResponse.json({
      success: true,
      jobId,
      downloadUrl,
      format,
      quality,
    })
  } catch (error) {
    console.error("[v0] Export error:", error)
    return NextResponse.json({ error: "Failed to export video" }, { status: 500 })
  }
}
