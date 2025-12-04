import { type NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/mongodb"
import { getPublicUrl } from "@/lib/oracle-storage"
import { ObjectId } from "mongodb"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const signedUrl = getPublicUrl(upload.storage_path)

  return NextResponse.json({ signedUrl })
}