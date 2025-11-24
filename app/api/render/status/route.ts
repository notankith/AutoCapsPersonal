import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const jobId = request.nextUrl.searchParams.get("id")
  if (!jobId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single()

  type JobRecord = Record<string, unknown> & { user_id: string }
  const jobRecord = job as JobRecord | null

  if (error || !jobRecord || jobRecord.user_id !== user.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  let upload = null
  if (jobRecord.upload_id) {
    const { data: uploadRow } = await admin
      .from("uploads")
      .select("id, status, storage_path, render_asset_path")
      .eq("id", jobRecord.upload_id as string)
      .maybeSingle()
    upload = uploadRow ?? null
  }

  return NextResponse.json({ job: jobRecord, upload })
}
