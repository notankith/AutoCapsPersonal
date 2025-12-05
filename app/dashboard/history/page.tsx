import { getDb } from "@/lib/mongodb"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Edit3, Trash2, Search } from "lucide-react"
import Link from "next/link"
import { FileText } from "lucide-react"
import { DeleteHistoryButton } from "@/components/dashboard/history/delete-history-button"
import { getCurrentUser } from "@/lib/auth"

interface UploadHistoryEntry {
  id: string
  file_name: string | null
  duration_seconds: number | null
  status: string | null
  created_at: string
  updated_at: string | null
  file_size: number | null
}

export default async function HistoryPage() {
  const user = await getCurrentUser()
  const userId = user?.userId || "default-user"

  const db = await getDb()
  
  let uploads: UploadHistoryEntry[] = []
  try {
    const data = await db.collection("uploads")
      .find({ user_id: userId })
      .sort({ updated_at: -1 })
      .toArray()

    uploads = data.map(doc => ({
      id: doc._id.toString(),
      file_name: doc.file_name,
      file_size: doc.file_size,
      duration_seconds: doc.duration_seconds,
      status: doc.status,
      created_at: doc.created_at?.toISOString() || new Date().toISOString(),
      updated_at: doc.updated_at?.toISOString() || null,
    }))
  } catch (error) {
    console.error("Error fetching uploads:", error)
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes || Number.isNaN(bytes)) return "—"
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)}MB`
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds || Number.isNaN(seconds)) return "—"
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      case "transcribed":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Video History</h1>
            <p className="text-muted-foreground">All your uploaded and processed videos</p>
          </div>
          {uploads.length > 0 && <DeleteHistoryButton />}
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search videos..." className="pl-10" aria-label="Search uploaded videos" />
        </div>
      </div>

      {uploads.length === 0 ? (
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
          {uploads.map((upload) => (
            <Card key={upload.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="py-6 px-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">{upload.file_name ?? "Untitled upload"}</h3>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span>{formatDate(upload.updated_at ?? upload.created_at)}</span>
                      <span className="hidden md:inline">•</span>
                      <span>{formatDuration(upload.duration_seconds)}</span>
                      <span className="hidden md:inline">•</span>
                      <span>{formatFileSize(upload.file_size)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(upload.status)}`}
                    >
                      {(upload.status ?? "pending").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
                    </span>

                    <div className="flex gap-2">
                      <Link href={`/dashboard/workspace/${upload.id}`}>
                        <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                          <Edit3 className="w-4 h-4" />
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                      </Link>
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
