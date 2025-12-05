import { getDb } from "@/lib/mongodb"
import { deleteFile } from "@/lib/oracle-storage"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.userId
  const db = await getDb()

  try {
    // 1. Get all uploads
    const uploads = await db.collection("uploads").find({ user_id: userId }).toArray()
    
    // 2. Get all jobs
    const jobs = await db.collection("jobs").find({ user_id: userId }).toArray()

    // 3. Collect all file paths to delete
    const filesToDelete = new Set<string>()

    for (const upload of uploads) {
      if (upload.storage_path) filesToDelete.add(upload.storage_path)
      if (upload.render_asset_path) filesToDelete.add(upload.render_asset_path)
      if (upload.caption_asset_path) filesToDelete.add(upload.caption_asset_path)
    }

    for (const job of jobs) {
      if (job.payload?.captionPath) filesToDelete.add(job.payload.captionPath)
      if (job.result?.storagePath) filesToDelete.add(job.result.storagePath)
    }

    console.log(`[Purge] Found ${filesToDelete.size} files to delete for user ${userId}`)

    // 4. Delete files from Oracle
    const deletePromises = Array.from(filesToDelete).map(path => 
      deleteFile(path).catch(err => {
        console.warn(`[Purge] Failed to delete file ${path}:`, err)
        // Continue even if one fails
      })
    )
    await Promise.all(deletePromises)

    // 5. Delete DB records
    await db.collection("uploads").deleteMany({ user_id: userId })
    await db.collection("jobs").deleteMany({ user_id: userId })
    await db.collection("transcripts").deleteMany({ user_id: userId })
    await db.collection("translations").deleteMany({ user_id: userId })

    return NextResponse.json({ success: true, deletedFiles: filesToDelete.size })
  } catch (error) {
    console.error("Purge error:", error)
    return NextResponse.json({ error: "Failed to purge history" }, { status: 500 })
  }
}
