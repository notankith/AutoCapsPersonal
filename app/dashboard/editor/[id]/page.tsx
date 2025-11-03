import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { EditorLayout } from "@/components/editor/editor-layout"

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { id } = await params

  // Fetch video data
  const { data: video, error } = await supabase.from("videos").select("*").eq("id", id).eq("user_id", user.id).single()

  if (error || !video) {
    redirect("/dashboard")
  }

  return <EditorLayout video={video} />
}
