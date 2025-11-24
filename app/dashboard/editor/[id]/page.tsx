import { redirect } from "next/navigation"
export default function EditorPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/workspace/${params.id}`)
}
