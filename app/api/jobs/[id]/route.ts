import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = paramsSchema.parse(await context.params)

  const { data: job, error } = await admin.from("jobs").select("*").eq("id", id).single()

  type JobRecord = Record<string, unknown> & { user_id: string }
  const jobRecord = job as JobRecord | null

  if (error || !jobRecord || jobRecord.user_id !== user.id) {
    console.warn("Job fetch mismatch", {
      jobId: id,
      jobUserId: jobRecord?.user_id,
      requestUserId: user.id,
      error: error?.message,
    })
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
