import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { videoId } = await request.json()

    if (!videoId) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    // Get video to verify ownership and get file path
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single()

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    // Extract file path from URL
    const filePath = `videos/${user.id}/${video.original_file_url.split("/").pop()}`

    // Delete from storage
    const { error: deleteError } = await supabase.storage.from("videos").remove([filePath])

    if (deleteError) {
      console.error("[v0] Storage deletion error:", deleteError)
      return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
    }

    // Delete from database
    const { error: dbError } = await supabase.from("videos").delete().eq("id", videoId)

    if (dbError) {
      console.error("[v0] Database deletion error:", dbError)
      return NextResponse.json({ error: "Failed to delete video record" }, { status: 500 })
    }

    // Clean up associated processing jobs
    const { error: jobError } = await supabase.from("processing_jobs").delete().eq("video_id", videoId)

    if (jobError) {
      console.error("[v0] Job deletion error:", jobError)
    }

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
    })
  } catch (error) {
    console.error("[v0] Deletion error:", error)
    return NextResponse.json({ error: "Failed to delete video" }, { status: 500 })
  }
}
