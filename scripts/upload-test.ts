import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const testFilePath = resolve("test.mp4")
  const fileBuffer = await readFile(testFilePath)
  const storagePath = `manual-tests/${Date.now()}-test.mp4`

  const { data: signed, error: signedError } = await client.storage.from("uploads").createSignedUploadUrl(storagePath)
  if (signedError || !signed) {
    console.error("createSignedUploadUrl error", signedError)
    throw signedError ?? new Error("Failed to create signed upload URL")
  }

  const { error: uploadError } = await client.storage
    .from("uploads")
    .uploadToSignedUrl(storagePath, signed.token, fileBuffer, { contentType: "video/mp4" })

  if (uploadError) {
    throw uploadError
  }

  const { data: link } = await client.storage.from("uploads").createSignedUrl(storagePath, 3600)
  console.log("Uploaded test.mp4 to:", storagePath)
  if (link?.signedUrl) {
    console.log("Temporary download URL:", link.signedUrl)
  }
}

main().catch((error) => {
  console.error("Test upload failed", error)
  process.exit(1)
})
