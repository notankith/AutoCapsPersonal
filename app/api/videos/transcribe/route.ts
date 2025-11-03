import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { videoId, fileUrl } = await request.json()

    if (!videoId || !fileUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Update job status to processing
    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update({ status: "processing", started_at: new Date() })
      .eq("video_id", videoId)
      .eq("job_type", "transcription")

    if (updateError) {
      console.error("[v0] Job update error:", updateError)
      return NextResponse.json({ error: "Failed to update job status" }, { status: 500 })
    }

    // Call OpenAI Whisper API for transcription
    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: new FormData(), // Would include file stream in production
    })

    if (!whisperResponse.ok) {
      console.error("[v0] Whisper API error:", await whisperResponse.text())
      throw new Error("Failed to transcribe video")
    }

    const transcriptionData = await whisperResponse.json()
    const transcript = transcriptionData.text

    // Parse transcript into captions (basic implementation)
    const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim())
    const captions = sentences.map((sentence, index) => ({
      id: `caption_${index}`,
      start_time: index * 5,
      end_time: (index + 1) * 5,
      text: sentence.trim(),
    }))

    // Update video with transcript
    const { error: videoUpdateError } = await supabase
      .from("videos")
      .update({
        status: "captions_ready",
        transcript,
        captions,
      })
      .eq("id", videoId)

    if (videoUpdateError) {
      console.error("[v0] Video update error:", videoUpdateError)
      return NextResponse.json({ error: "Failed to update video" }, { status: 500 })
    }

    // Mark job as completed
    const { error: jobCompleteError } = await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date(),
        output_data: { transcript, captions, word_count: transcript.split(" ").length },
      })
      .eq("video_id", videoId)
      .eq("job_type", "transcription")

    if (jobCompleteError) {
      console.error("[v0] Job completion error:", jobCompleteError)
      return NextResponse.json({ error: "Failed to mark job as completed" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transcript,
      captions,
      wordCount: transcript.split(" ").length,
    })
  } catch (error) {
    console.error("[v0] Transcription error:", error)
    return NextResponse.json({ error: "Failed to transcribe video" }, { status: 500 })
  }
}
