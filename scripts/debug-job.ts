import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

config({ path: ".env.local" })

async function main() {
  const [, , jobId] = process.argv
  if (!jobId) {
    console.error("Usage: pnpm tsx scripts/debug-job.ts <jobId>")
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    throw new Error("Supabase env vars missing")
  }

  const client = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: job, error } = await client.from("jobs").select("*").eq("id", jobId).maybeSingle()
  console.log(JSON.stringify({ job, error }, null, 2))
}

main()
