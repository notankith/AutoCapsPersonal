import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const title = formData.get("title") as string
    const hasTranscript = formData.get("hasTranscript") === "true"
    const customTranscript = formData.get("transcript") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    // Generate unique file name
    const fileExt = file.name.split(".").pop()
    const fileName = `${uuidv4()}.${fileExt}`
    const filePath = `videos/${user.id}/${fileName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage.from("videos").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (uploadError) {
      console.error("[v0] Upload error:", uploadError)
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(filePath)

    // Create video record in database
    const { data: video, error: dbError } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        title,
        original_file_url: publicUrlData.publicUrl,
        file_size: file.size,
        status: hasTranscript && customTranscript ? "captions_ready" : "pending",
        transcript: customTranscript || null,
        language: "en",
      })
      .select()
      .single()

    if (dbError) {
      console.error("[v0] Database error:", dbError)
      return NextResponse.json({ error: "Failed to create video record" }, { status: 500 })
    }

    // Create processing job
    const jobType = hasTranscript && customTranscript ? "export" : "transcription"
    const { error: jobError } = await supabase.from("processing_jobs").insert({
      video_id: video.id,
      user_id: user.id,
      job_type: jobType,
      status: "pending",
      input_data: {
        file_url: publicUrlData.publicUrl,
        language: "en",
        has_custom_transcript: hasTranscript,
      },
    })

    if (jobError) {
      console.error("[v0] Job creation error:", jobError)
      return NextResponse.json({ error: "Failed to create processing job" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      videoId: video.id,
      message: hasTranscript ? "Video uploaded with transcript" : "Video uploaded. Transcription starting...",
    })
  } catch (error) {
    console.error("[v0] Upload error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
