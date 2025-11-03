"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Edit3 } from "lucide-react"
import Link from "next/link"

interface Video {
  id: string
  title: string
  duration: number
  status: string
  created_at: string
  file_size: number
}

interface RecentVideosProps {
  videos: Video[]
}

export function RecentVideos({ videos }: RecentVideosProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Videos</CardTitle>
      </CardHeader>
      <CardContent>
        {videos.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No videos yet. Upload your first video to get started!
          </p>
        ) : (
          <div className="space-y-4">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="flex-1">
                  <h4 className="font-semibold">{video.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {Math.round(video.duration / 60)}m • {(video.file_size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    video.status === "completed"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : video.status === "processing"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {video.status}
                </span>
                <div className="flex gap-2 ml-4">
                  <Link href={`/dashboard/editor/${video.id}`}>
                    <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                      <Edit3 className="w-4 h-4" />
                      Edit
                    </Button>
                  </Link>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
