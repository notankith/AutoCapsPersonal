"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, X, Loader } from "lucide-react"

interface ExportPanelProps {
  videoId: string
  captions: any[]
  onClose: () => void
}

export function ExportPanel({ videoId, captions, onClose }: ExportPanelProps) {
  const [format, setFormat] = useState("mp4")
  const [quality, setQuality] = useState("1080p")
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const handleExport = async () => {
    setIsExporting(true)
    setExportStatus("Starting export...")

    try {
      const response = await fetch("/api/videos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, format, quality }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setExportStatus("Export completed! Downloading...")
      // Trigger download
      setTimeout(() => onClose(), 1000)
    } catch (error) {
      setExportStatus(`Error: ${error instanceof Error ? error.message : "Export failed"}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Export Video</CardTitle>
            <CardDescription>With burned-in captions</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="mov">MOV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p (Recommended)</option>
              <option value="2160p">4K (2160p)</option>
            </select>
          </div>

          {exportStatus && <div className="p-3 bg-secondary rounded-lg text-sm text-center">{exportStatus}</div>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting} className="flex-1 gap-2">
              {isExporting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
