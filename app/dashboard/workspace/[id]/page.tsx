import { redirect } from "next/navigation"
import { getDb } from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { PostUploadWorkspace } from "@/components/editor/post-upload-workspace"

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  // TODO: Get user from session/JWT token
  const userId = "default-user" // Temporary until auth is implemented

  const db = await getDb()
  
  const upload = await db.collection("uploads").findOne({
    _id: new ObjectId(resolvedParams.id),
    user_id: userId
  })

  if (!upload) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background px-4 py-10 md:px-10">
      <PostUploadWorkspace uploadId={upload._id.toString()} />
    </div>
  )
}
