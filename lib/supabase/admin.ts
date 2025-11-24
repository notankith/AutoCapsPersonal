import { createClient } from "@supabase/supabase-js"
import { assertEnv } from "@/lib/pipeline"

let cachedAdminClient: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (cachedAdminClient) {
    return cachedAdminClient
  }

  const url = assertEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)

  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return cachedAdminClient
}
