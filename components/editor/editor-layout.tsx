"use client"

import { useEffect, useRef, useState } from "react"
import { VideoPlayer } from "./video-player"
import { CaptionTimeline } from "./caption-timeline"
import { CaptionEditor } from "./caption-editor"
import { ExportPanel } from "./export-panel"
import { Button } from "@/components/ui/button"
import { Download, Languages } from "lucide-react"

interface Video {
  id: string
  title: string
  original_file_url: string
  captions: any[]
  language: string
}

interface EditorLayoutProps {
  video: Video
  onCaptionsChange?: (captions: any[]) => void
  exportTrigger?: number
}

export function EditorLayout({ video, onCaptionsChange, exportTrigger }: EditorLayoutProps) {
  const [captions, setCaptions] = useState(video.captions || [])
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [language, setLanguage] = useState(video.language)
  const exportSignal = useRef(exportTrigger)

  useEffect(() => {
    onCaptionsChange?.(captions)
  }, [captions, onCaptionsChange])

  useEffect(() => {
    if (typeof exportTrigger === "undefined") {
      return
    }
    if (exportSignal.current === exportTrigger) {
      return
    }
    exportSignal.current = exportTrigger
    setShowExportPanel(true)
  }, [exportTrigger])

  const handleCaptionUpdate = (id: string, updates: any) => {
    setCaptions(captions.map((cap) => (cap.id === id ? { ...cap, ...updates } : cap)))
  }

  const handleCaptionAdd = () => {
    const newCaption = {
      id: Date.now().toString(),
      start_time: currentTime,
      end_time: currentTime + 3,
      text: "New caption",
    }
    setCaptions([...captions, newCaption])
    setSelectedCaption(newCaption.id)
  }

  const handleCaptionDelete = (id: string) => {
    setCaptions(captions.filter((cap) => cap.id !== id))
    setSelectedCaption(null)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Controls */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{video.title}</h1>
          <p className="text-sm text-muted-foreground">
            {captions.length} captions • Language: {language}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 bg-transparent">
            <Languages className="w-4 h-4" />
            Translate
          </Button>
          <Button onClick={() => setShowExportPanel(true)} className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Video Player & Timeline */}
        <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
          <VideoPlayer
            videoUrl={video.original_file_url}
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            captions={captions}
          />
          <CaptionTimeline
            captions={captions}
            selectedCaption={selectedCaption}
            onSelectCaption={setSelectedCaption}
            currentTime={currentTime}
            onAddCaption={handleCaptionAdd}
          />
        </div>

        {/* Right Side - Caption Editor */}
        <div className="w-96 border-l border-border overflow-auto">
          {selectedCaption ? (
            <CaptionEditor
              caption={captions.find((c) => c.id === selectedCaption)}
              onUpdate={(updates) => handleCaptionUpdate(selectedCaption, updates)}
              onDelete={() => handleCaptionDelete(selectedCaption)}
            />
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <p>Select a caption to edit or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* Export Panel */}
      {showExportPanel && (
        <ExportPanel videoId={video.id} captions={captions} onClose={() => setShowExportPanel(false)} />
      )}
    </div>
  )
}
