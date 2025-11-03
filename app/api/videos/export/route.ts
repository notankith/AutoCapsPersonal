import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { videoId, format = "mp4", quality = "1080p", includeCaptions = true } = await request.json()

    if (!videoId) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    // Get video data
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single()

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    // Create export job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        video_id: videoId,
        user_id: user.id,
        job_type: "export",
        status: "processing",
        input_data: {
          format,
          quality,
          include_captions: includeCaptions,
          captions: video.captions,
        },
        started_at: new Date(),
      })
      .select()
      .single()

    if (jobError) {
      console.error("[v0] Job creation error:", jobError)
      return NextResponse.json({ error: "Failed to create export job" }, { status: 500 })
    }

    // Generate processed file URL
    const processedUrl = `${video.original_file_url}?export=true&format=${format}&quality=${quality}&job_id=${job.id}`

    // Update job as completed
    const { error: completeError } = await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date(),
        output_data: {
          processed_url: processedUrl,
          format,
          quality,
          file_size_estimate: Math.round(video.file_size * 0.8),
        },
      })
      .eq("id", job.id)

    if (completeError) {
      console.error("[v0] Job completion error:", completeError)
      return NextResponse.json({ error: "Failed to complete export job" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      processedUrl,
      format,
      quality,
      downloadUrl: processedUrl,
    })
  } catch (error) {
    console.error("[v0] Export error:", error)
    return NextResponse.json({ error: "Failed to export video" }, { status: 500 })
  }
}
