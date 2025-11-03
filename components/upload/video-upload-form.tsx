"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, AlertCircle, Loader } from "lucide-react"
import { useRouter } from "next/navigation"

export function VideoUploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title) {
      setError("Please select a video and enter a title")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", title)
      formData.append("description", description)

      // Upload to API route
      const response = await fetch("/api/videos/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Upload failed")
      }

      const data = await response.json()
      router.push(`/dashboard/editor/${data.videoId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* File Upload Area */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" onChange={handleFileChange} accept="video/*" className="hidden" />
        <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="font-semibold mb-2">{file ? file.name : "Click to upload or drag and drop"}</p>
        <p className="text-sm text-muted-foreground">MP4, WebM, MOV • Max 2GB</p>
      </div>

      {/* Title Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Video Title</label>
        <Input placeholder="My Amazing Video" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      {/* Description Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Description (Optional)</label>
        <textarea
          placeholder="Add a description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={4}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button type="submit" className="w-full" disabled={isLoading || !file} size="lg">
        {isLoading ? (
          <>
            <Loader className="w-4 h-4 mr-2 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Upload & Process
          </>
        )}
      </Button>
    </form>
  )
}
