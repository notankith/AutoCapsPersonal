import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKETS } from "@/lib/pipeline"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .select("id, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (uploadError || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .storage
    .from(STORAGE_BUCKETS.uploads)
    .createSignedUrl(upload.storage_path, 60 * 15)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Video not ready" }, { status: 404 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}