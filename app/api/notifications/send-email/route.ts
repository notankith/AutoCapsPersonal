import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { videoId, eventType, userEmail } = await request.json()

    if (!videoId || !eventType || !userEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get video details
    const { data: video } = await supabase.from("videos").select("*").eq("id", videoId).single()

    // Email templates
    const emailTemplates: Record<string, { subject: string; body: string }> = {
      transcription_complete: {
        subject: `${video?.title} has been transcribed`,
        body: `Your video "${video?.title}" has been successfully transcribed. You can now edit the captions and export your video with burned-in captions.`,
      },
      export_complete: {
        subject: `${video?.title} export is ready`,
        body: `Your video "${video?.title}" with captions has been processed and is ready for download.`,
      },
      upload_failed: {
        subject: `Upload failed for ${video?.title}`,
        body: `Unfortunately, your video upload failed. Please try again.`,
      },
    }

    const template = emailTemplates[eventType]
    if (!template) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 })
    }

    // Call Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@autocaps.ai",
        to: userEmail,
        subject: template.subject,
        html: template.body,
      }),
    })

    if (!resendResponse.ok) {
      console.error("[v0] Resend API error:", await resendResponse.text())
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
    }

    const resendData = await resendResponse.json()

    // Log email sent
    const { error: logError } = await supabase.from("email_logs").insert({
      video_id: videoId,
      user_email: userEmail,
      event_type: eventType,
      status: "sent",
      resend_id: resendData.id,
    })

    if (logError) {
      console.error("[v0] Email log error:", logError)
    }

    return NextResponse.json({
      success: true,
      emailId: resendData.id,
      eventType,
    })
  } catch (error) {
    console.error("[v0] Email notification error:", error)
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }
}
