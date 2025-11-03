"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, AlertCircle, Loader, CheckCircle, FileText } from "lucide-react"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [hasTranscript, setHasTranscript] = useState(false)
  const [transcriptText, setTranscriptText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 2 * 1024 * 1024 * 1024) {
        setError("File size must be less than 2GB")
        return
      }
      setFile(selectedFile)
      setError(null)
      setSuccess(false)
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile?.type.startsWith("video/")) {
      handleFileChange({ target: { files: e.dataTransfer.files } } as any)
    } else {
      setError("Please drop a video file")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title) {
      setError("Please select a video and enter a title")
      return
    }

    if (hasTranscript && !transcriptText.trim()) {
      setError("Please enter a transcript")
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", title)
      formData.append("hasTranscript", String(hasTranscript))
      if (hasTranscript) {
        formData.append("transcript", transcriptText)
      }

      const response = await fetch("/api/videos/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Upload failed")
      }

      const data = await response.json()
      setSuccess(true)
      setFile(null)
      setTitle("")
      setTranscriptText("")
      setHasTranscript(false)

      setTimeout(() => {
        router.push(`/dashboard/editor/${data.videoId}`)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-balance">
            Create Captions in <span className="text-primary">Seconds</span>
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            Upload your video and captions will be generated automatically using AI
          </p>
        </div>

        {/* Main Upload Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Video Upload Area */}
          <div
            className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all duration-300 group"
            onClick={() => document.getElementById("video-input")?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input id="video-input" type="file" onChange={handleFileChange} accept="video/*" className="hidden" />
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                {file ? (
                  <p className="font-semibold text-foreground">{file.name}</p>
                ) : (
                  <>
                    <p className="font-semibold text-foreground mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground">MP4, WebM, MOV • Max 2GB</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Video Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-semibold mb-2">
              Video Title
            </label>
            <Input
              id="title"
              placeholder="My Amazing Video"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-base h-11"
            />
          </div>

          {/* Transcript Toggle */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="transcript-toggle"
                checked={hasTranscript}
                onChange={(e) => setHasTranscript(e.target.checked)}
                className="w-5 h-5 cursor-pointer accent-primary"
              />
              <label htmlFor="transcript-toggle" className="font-semibold cursor-pointer">
                I already have a transcript
              </label>
              <FileText className="w-5 h-5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-sm text-muted-foreground">
              {hasTranscript
                ? "Paste your transcript below to skip automatic transcription"
                : "If you don't have one, we'll generate it automatically using AI"}
            </p>
          </div>

          {/* Transcript Input - Conditional Render */}
          {hasTranscript && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label htmlFor="transcript" className="block text-sm font-semibold">
                Paste your transcript
              </label>
              <textarea
                id="transcript"
                placeholder="Paste your video transcript here..."
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none text-base"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Make sure your transcript is accurately formatted for the best results
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-700 dark:text-green-400 animate-in fade-in slide-in-from-top-2 duration-300">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">Video uploaded successfully! Redirecting...</p>
            </div>
          )}

          {/* Submit Button */}
          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading || !file} size="lg">
            {isLoading ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                {hasTranscript ? "Upload with Transcript" : "Upload & Auto-Transcribe"}
              </>
            )}
          </Button>
        </form>

        {/* Footer Info */}
        <div className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            Your videos are securely stored and processed. No data is shared with third parties.
          </p>
        </div>
      </div>
    </div>
  )
}
