import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Missing envs")
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const client = createClient(url, anonKey)

  const testFilePath = resolve("test.mp4")
  const fileBuffer = await readFile(testFilePath)
  const path = `manual-tests/${Date.now()}-anon.mp4`
  const { data: signed, error } = await admin.storage.from("uploads").createSignedUploadUrl(path)
  if (error || !signed) {
    throw error ?? new Error("createSignedUploadUrl failed")
  }

  const { error: uploadError } = await client.storage
    .from("uploads")
    .uploadToSignedUrl(signed.path, signed.token, new Blob([fileBuffer]), { contentType: "video/mp4" })

  if (uploadError) {
    console.error(uploadError)
    throw uploadError
  }

  console.log("Anon upload succeeded", path)
}

main().catch((err) => {
  console.error("Anon upload test failed", err)
  process.exit(1)
})
