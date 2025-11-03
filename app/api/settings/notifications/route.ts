import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await request.json()

    // Store notification settings in user metadata or separate table
    const { error } = await supabase.auth.updateUser({
      data: { notification_settings: settings },
    })

    if (error) {
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Settings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
