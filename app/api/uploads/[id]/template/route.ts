import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const requestSchema = z.object({
  templateId: z.string().min(1, "Template is required"),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()

  try {
    const body = requestSchema.parse(await request.json())
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: uploadId } = await params

    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .select("id, metadata")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .single()

    if (uploadError || !upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    const metadata = (upload.metadata as Record<string, unknown> | null) ?? {}

    const updatedMetadata = {
      ...metadata,
      templateId: body.templateId,
    }

    const { error: updateError } = await supabase
      .from("uploads")
      .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
      .eq("id", uploadId)

    if (updateError) {
      console.error("Failed to update template selection", updateError)
      return NextResponse.json({ error: "Could not apply template" }, { status: 500 })
    }

    return NextResponse.json({ templateId: body.templateId })
  } catch (error) {
    console.error("Template apply error", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}
