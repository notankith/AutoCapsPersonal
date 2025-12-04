import { getDb } from "@/lib/mongodb"
import { getPublicUrl } from "@/lib/oracle-storage"
import { NextResponse, type NextRequest } from "next/server"
import { ObjectId } from "mongodb"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await getDb()
  
  // TODO: Get userId from JWT token instead of hardcoding
  const userId = "default-user"

  let upload
  try {
    upload = await db.collection("uploads").findOne({
      _id: new ObjectId(id),
      user_id: userId,
    })
  } catch (error) {
    return NextResponse.json({ error: "Invalid upload ID format" }, { status: 400 })
  }

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 })
  }

  if (!upload.render_asset_path) {
    return NextResponse.json({ error: "Rendered file not ready" }, { status: 404 })
  }

  const signedUrl = getPublicUrl(upload.render_asset_path)

  return NextResponse.json({ signedUrl })
}
