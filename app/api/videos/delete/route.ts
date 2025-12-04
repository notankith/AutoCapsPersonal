import { type NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/mongodb"
import { deleteFile } from "@/lib/oracle-storage"
import { ObjectId } from "mongodb"

export async function DELETE(request: NextRequest) {
  try {
    const db = await getDb()
    
    // TODO: Get userId from JWT token instead of hardcoding
    const userId = "default-user"

    const { videoId } = await request.json()

    if (!videoId) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    // Get upload to verify ownership and get file path
    let upload
    try {
      upload = await db.collection("uploads").findOne({
        _id: new ObjectId(videoId),
        user_id: userId,
      })
    } catch (error) {
      return NextResponse.json({ error: "Invalid video ID format" }, { status: 400 })
    }

    if (!upload) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    // Delete from storage
    try {
      await deleteFile(upload.storage_path)
    } catch (deleteError) {
      console.error("[v0] Storage deletion error:", deleteError)
      // Continue even if storage deletion fails
    }

    // Delete from database
    await db.collection("uploads").deleteOne({ _id: upload._id })

    // Clean up associated transcripts, translations, and jobs
    await db.collection("transcripts").deleteMany({ upload_id: videoId })
    await db.collection("translations").deleteMany({ upload_id: videoId })
    await db.collection("jobs").deleteMany({ upload_id: videoId })

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
    })
  } catch (error) {
    console.error("[v0] Deletion error:", error)
    return NextResponse.json({ error: "Failed to delete video" }, { status: 500 })
  }
}
