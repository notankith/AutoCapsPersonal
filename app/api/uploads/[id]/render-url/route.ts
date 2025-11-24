import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKETS } from "@/lib/pipeline"
import { NextResponse, type NextRequest } from "next/server"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: upload, error } = await supabase
    .from("uploads")
    .select("id, render_asset_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (error || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 })
  }

  if (!upload.render_asset_path) {
    return NextResponse.json({ error: "Rendered file not ready" }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error: urlError } = await admin
    .storage
    .from(STORAGE_BUCKETS.renders)
    .createSignedUrl(upload.render_asset_path, 60 * 60)

  if (urlError || !data?.signedUrl) {
    return NextResponse.json({ error: urlError?.message ?? "Unable to sign render asset" }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
