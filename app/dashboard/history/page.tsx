import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Edit3, Trash2 } from "lucide-react"
import Link from "next/link"
import { FileText } from "lucide-react" // Added import for FileText

interface Video {
  id: string
  title: string
  duration: number
  status: string
  created_at: string
  file_size: number
  transcript?: string
}

export default async function HistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: videos = [], error: fetchError } = await supabase
    .from("videos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (fetchError) {
    console.error("Error fetching videos:", fetchError)
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return mb.toFixed(1)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Video History</h1>
        <p className="text-muted-foreground">All your uploaded and processed videos</p>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">No videos yet. Upload your first video to get started!</p>
              <Link href="/dashboard">
                <Button>Upload Video</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {videos.map((video: Video) => (
            <Card key={video.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="py-6 px-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">{video.title}</h3>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span>{formatDate(video.created_at)}</span>
                      <span className="hidden md:inline">•</span>
                      <span>{Math.round(video.duration / 60)}m</span>
                      <span className="hidden md:inline">•</span>
                      <span>{formatFileSize(video.file_size)}MB</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(video.status)}`}
                    >
                      {video.status.charAt(0).toUpperCase() + video.status.slice(1)}
                    </span>

                    <div className="flex gap-2">
                      <Link href={`/dashboard/editor/${video.id}`}>
                        <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                          <Edit3 className="w-4 h-4" />
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                        <Download className="w-4 h-4" />
                        <span className="hidden md:inline">Download</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 bg-transparent text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden md:inline">Delete</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
