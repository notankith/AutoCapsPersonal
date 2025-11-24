import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PostUploadWorkspace } from "@/components/editor/post-upload-workspace"

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .select("id")
    .eq("id", resolvedParams.id)
    .eq("user_id", user.id)
    .single()

  if (uploadError || !upload) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background px-4 py-10 md:px-10">
      <PostUploadWorkspace uploadId={upload.id} />
    </div>
  )
}
