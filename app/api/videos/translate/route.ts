import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { videoId, language, captions } = await request.json()

    if (!videoId || !language || !captions) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create translation job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        video_id: videoId,
        user_id: user.id,
        job_type: "translation",
        status: "processing",
        input_data: { language, caption_count: captions.length },
        started_at: new Date(),
      })
      .select()
      .single()

    if (jobError) {
      console.error("[v0] Job creation error:", jobError)
      return NextResponse.json({ error: "Failed to create translation job" }, { status: 500 })
    }

    // Call OpenAI GPT-4o mini for translation
    const translationPrompt = `Translate the following captions to ${language}. Return only the translated text for each caption, preserving the original structure:\n\n${captions
      .map((c: any) => c.text)
      .join("\n")}`

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: translationPrompt }],
        temperature: 0.3,
      }),
    })

    if (!gptResponse.ok) {
      console.error("[v0] GPT API error:", await gptResponse.text())
      throw new Error("Failed to translate captions")
    }

    const gptData = await gptResponse.json()
    const translatedText = gptData.choices[0].message.content
    const translatedLines = translatedText.split("\n").filter((l: string) => l.trim())

    // Map translations back to captions
    const translatedCaptions = captions.map((caption: any, index: number) => ({
      ...caption,
      translated_text: translatedLines[index] || caption.text,
    }))

    // Update job as completed
    const { error: completeError } = await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date(),
        output_data: { translated_captions: translatedCaptions, target_language: language },
      })
      .eq("id", job.id)

    if (completeError) {
      console.error("[v0] Job completion error:", completeError)
      return NextResponse.json({ error: "Failed to complete translation job" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      translatedCaptions,
      language,
    })
  } catch (error) {
    console.error("[v0] Translation error:", error)
    return NextResponse.json({ error: "Failed to translate captions" }, { status: 500 })
  }
}
