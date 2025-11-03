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

    const { videoId, captions, fontStyle, fontSize, position } = await request.json()

    if (!videoId || !captions) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get video
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single()

    if (videoError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    // Create render job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        video_id: videoId,
        user_id: user.id,
        job_type: "render",
        status: "processing",
        input_data: {
          captions,
          font_style: fontStyle || "Arial",
          font_size: fontSize || 24,
          position: position || "bottom",
        },
        started_at: new Date(),
      })
      .select()
      .single()

    if (jobError) {
      console.error("[v0] Job creation error:", jobError)
      return NextResponse.json({ error: "Failed to create render job" }, { status: 500 })
    }

    // In production, call actual FFmpeg API or service
    // For now, simulate processing
    const processedUrl = `${video.original_file_url}?with_captions=true&job_id=${job.id}`

    // Update job as completed
    const { error: completeError } = await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date(),
        output_data: { processed_url: processedUrl, caption_count: captions.length },
      })
      .eq("id", job.id)

    if (completeError) {
      console.error("[v0] Job completion error:", completeError)
      return NextResponse.json({ error: "Failed to complete render job" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      processedUrl,
      jobId: job.id,
    })
  } catch (error) {
    console.error("[v0] Render error:", error)
    return NextResponse.json({ error: "Failed to render video" }, { status: 500 })
  }
}
