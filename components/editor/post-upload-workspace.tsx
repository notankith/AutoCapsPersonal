"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TemplateSelector } from "./template-selector"
import { type TemplateOption } from "@/components/templates/types"
import { defaultTemplates, findTemplateById } from "@/components/templates/data"
import { Download, Pause, Play, Plus, Search, Trash2, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { type CaptionSegment, type CaptionWord } from "@/lib/pipeline"
import { SimpleCaptionOverlay } from "./caption-overlays"
import { CreatorKineticOverlay, type OverlayConfig } from "./creator-kinetic-overlay"
import { type KineticWord } from "./kinetic-caption-utils"

interface PostUploadWorkspaceProps {
  uploadId: string
}

type PreviewSession = {
  upload: {
    id: string
    title: string
    templateId: string | null
    language: string | null
  }
  video: {
    url: string | null
    durationSeconds: number | null
  }
  transcript: {
    id: string
    language: string | null
    segments: CaptionSegment[]
  }
}

type RawPreviewWord = Partial<CaptionWord> & { word?: string }
type RawPreviewSegment = {
  id?: string | number
  start?: number
  end?: number
  text?: string
  words?: RawPreviewWord[]
  start_time?: number
  end_time?: number
}

export function PostUploadWorkspace({ uploadId }: PostUploadWorkspaceProps) {
  const [preview, setPreview] = useState<PreviewSession | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>(defaultTemplates[0].id)
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false)
  const [isDispatchingRender, setIsDispatchingRender] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [jobMessage, setJobMessage] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<number | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([])
  const baseSegmentsRef = useRef<CaptionSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentTime, setCurrentTime] = useState(0)
  const [isSavingTranscript, setIsSavingTranscript] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<{ variant: "success" | "error"; message: string } | null>(null)
  const [transcriptId, setTranscriptId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(createDefaultOverlayConfig())
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  const previewLanguage = preview?.transcript?.language ?? preview?.upload?.language ?? "en"
  const selectedTemplateOption = useMemo(
    () => defaultTemplates.find((template) => template.id === selectedTemplate) ?? defaultTemplates[0],
    [selectedTemplate],
  )

  const captionsForPlayer = useMemo(() => captionSegments, [captionSegments])
  const previewTitle = preview?.upload.title ?? "Preparing video..."
  const sliderMax = useMemo(() => {
    if (videoDuration > 0) return videoDuration
    if (preview?.video?.durationSeconds) return preview.video.durationSeconds
    return captionSegments.at(-1)?.end ?? 0
  }, [captionSegments, preview?.video?.durationSeconds, videoDuration])

  const videoAspectRatio = useMemo(() => {
    if (videoResolution?.width && videoResolution?.height && videoResolution.width > 0 && videoResolution.height > 0) {
      return Number((videoResolution.width / videoResolution.height).toFixed(4))
    }
    return 9 / 16
  }, [videoResolution])

  const playbackProgress = sliderMax > 0 ? Math.min(1, currentTime / sliderMax) : 0
  const formattedCurrentTime = formatTimestamp(currentTime)
  const formattedTotalDuration = formatTimestamp(sliderMax)

  const seekToTime = useCallback((time: number) => {
    const safeDuration = sliderMax || videoRef.current?.duration || 0
    const clamped = Math.max(0, Math.min(time, safeDuration))
    if (videoRef.current && !Number.isNaN(videoRef.current.duration)) {
      videoRef.current.currentTime = clamped
    }
    setCurrentTime(clamped)
  }, [sliderMax])

  const handleOverlayConfigChange = useCallback((config: OverlayConfig) => {
    setOverlayConfig(config)
  }, [])

  const invalidateRender = useCallback(() => {
    setDownloadUrl(null)
    setJobId(null)
    setJobStatus(null)
    setJobProgress(null)
    setJobMessage(null)
  }, [])

  const persistSegmentsToBase = useCallback((segments: CaptionSegment[]) => {
    baseSegmentsRef.current = mergeChunkedSegments(segments)
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const loadPreview = async () => {
      setIsPreviewLoading(true)
      setPreviewError(null)

      try {
        const response = await fetch("/api/preview/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
          signal: controller.signal,
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to initialize preview")
        }

        if (cancelled) return

        const resolvedTemplate = findTemplateById(payload?.upload?.templateId)
        const normalizedSegments = normalizeSegments(payload?.transcript?.segments as RawPreviewSegment[] | undefined)
        const templatedSegments = reshapeSegmentsForTemplate(normalizedSegments, resolvedTemplate.renderTemplate, resolvedTemplate.id)

        setPreview(payload as PreviewSession)
        baseSegmentsRef.current = normalizedSegments
        setCaptionSegments(templatedSegments)
        setTranscriptId(payload?.transcript?.id ?? null)
        setSelectedTemplate(resolvedTemplate.id)
      } catch (err) {
        if (controller.signal.aborted) return
        setPreviewError(err instanceof Error ? err.message : "Failed to initialize preview")
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [uploadId])

  useEffect(() => {
    if (selectedSegmentId) return
    if (captionSegments.length) {
      setSelectedSegmentId(captionSegments[0].id)
    }
  }, [captionSegments, selectedSegmentId])

  useEffect(() => {
    if (!selectedSegmentId) return
    if (!captionSegments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(captionSegments[0]?.id ?? null)
    }
  }, [captionSegments, selectedSegmentId])

  useEffect(() => {
    const active = captionSegments.find((segment) => currentTime >= segment.start && currentTime <= segment.end)
    if (active && active.id !== selectedSegmentId) {
      setSelectedSegmentId(active.id)
    }
  }, [captionSegments, currentTime, selectedSegmentId])

  useEffect(() => {
    if (!copyFeedback) return
    const timeout = window.setTimeout(() => setCopyFeedback(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copyFeedback])

  const overlayKineticWords = useMemo<KineticWord[]>(() => {
    return captionSegments
      .flatMap((segment) => ensureSegmentWords(segment))
      .map((word) => ({
        text: word.text,
        startSec: word.start,
        endSec: word.end,
      }))
  }, [captionSegments])

  const sortedSegments = useMemo(() => [...captionSegments].sort((a, b) => a.start - b.start), [captionSegments])

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedSegments
    }
    const query = searchQuery.toLowerCase()
    return sortedSegments.filter((segment) => segment.text.toLowerCase().includes(query))
  }, [searchQuery, sortedSegments])

  const fetchRenderDownload = useCallback(async () => {
    const response = await fetch(`/api/uploads/${uploadId}/render-url`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.signedUrl) {
      throw new Error(payload.error ?? "Unable to fetch rendered file")
    }
    return payload.signedUrl
  }, [uploadId])

  const enqueueRenderJob = useCallback(
    async (template: TemplateOption) => {
      setIsDispatchingRender(true)
      setJobMessage("Queuing render job...")
      setJobStatus("queued")
      setDownloadUrl(null)
      setJobProgress(0)

      try {
        // Calculate custom styles for export
        // Map percentage position (y) to ASS MarginV (pixels)
        // We use Alignment 2 (Bottom Center) for export to handle vertical offset reliably
        
        const playResX = videoResolution?.width ?? 1920
        const playResY = videoResolution?.height ?? 1080

        // Font Size Calculation:
        // In Preview: FontSize = 58 * (VideoWidth / 1920) * Scale
        // In ASS: FontSize is relative to PlayResY (usually).
        // If we set PlayResX/Y to match VideoWidth/Height, then the coordinate system matches the video.
        // So we want the font size to be the same fraction of the width.
        // TargetFontSize = 58 * (VideoWidth / 1920) * Scale.
        const targetFontSize = 58 * (playResX / 1920) * overlayConfig.scale
        
        // Formula: MarginV = (100 - y%) * (PlayResY / 100) - (Approx Half Text Height)
        // We approximate half text height as fontSize/2 to center the text at the y-coordinate
        const marginV = Math.max(0, Math.round((100 - overlayConfig.y) * (playResY / 100) - (targetFontSize / 2)))

        const payload = {
          uploadId,
          template: template.renderTemplate,
          resolution: "1080p" as const,
          segments: captionSegments.map((segment) => ({
            id: segment.id,
            start: segment.start,
            end: segment.end,
            text: segment.text,
            words: segment.words,
          })),
          customStyles: {
            fontSize: Math.round(targetFontSize),
            alignment: 2,
            marginV: marginV,
            playResX,
            playResY,
          },
          ...(transcriptId ? { transcriptId } : {}),
        }

        const response = await fetch("/api/render/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const body = await response.json().catch(() => ({}))

        if (!response.ok || !body.jobId) {
          throw new Error(body.error ?? "Failed to queue render job")
        }

        setJobId(body.jobId)
        setJobStatus(body.status ?? "queued")
        setJobMessage("Render job queued.")
      } catch (err) {
        setJobStatus("failed")
        setJobMessage(err instanceof Error ? err.message : "Render failed.")
        setJobProgress(null)
        throw err
      } finally {
        setIsDispatchingRender(false)
      }
    },
    [uploadId, captionSegments, transcriptId, overlayConfig, videoResolution]
  )

  const handleTemplateSelect = async (templateId: string) => {
    const template = defaultTemplates.find((t) => t.id === templateId)
    if (!template) return

    invalidateRender()
    setSelectedTemplate(templateId)
    // Always reshape from baseSegmentsRef (user-edited, never chunked)
    setCaptionSegments(reshapeSegmentsForTemplate(baseSegmentsRef.current, template.renderTemplate, template.id))
    setJobMessage(null)
    setIsApplyingTemplate(true)

    try {
      const resp = await fetch(`/api/uploads/${uploadId}/template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      })

      if (!resp.ok) {
        const p = await resp.json().catch(() => ({}))
        throw new Error(p.error ?? "Failed to save template selection")
      }

      setDownloadUrl(null)
      setJobMessage("Template updated. Click Export & Download to burn captions.")
      if (jobId) {
        setJobId(null)
        setJobStatus(null)
      }
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : "Could not update template.")
    } finally {
      setIsApplyingTemplate(false)
    }
  }

  const handleSegmentChange = (segmentId: string, patch: Partial<CaptionSegment>) => {
    setCaptionSegments((segments) => {
      // Update both the current segments and the base segments
      const updated = segments.map((segment) => {
        if (segment.id !== segmentId) return segment

        // If text is changing, we must regenerate words to keep the preview in sync
        // otherwise the overlay will continue showing the old words
        let newWords = segment.words
        if (patch.text !== undefined && patch.text !== segment.text) {
          const tokens = patch.text.split(/\s+/).map((t) => t.trim()).filter(Boolean)
          if (tokens.length > 0) {
            const duration = segment.end - segment.start
            const perToken = duration / tokens.length
            newWords = tokens.map((token, i) => ({
              text: token,
              start: segment.start + perToken * i,
              end: segment.start + perToken * (i + 1),
            }))
          } else {
            newWords = []
          }
        }

        return {
          ...segment,
          ...patch,
          words: newWords,
        }
      })
      persistSegmentsToBase(updated)
      invalidateRender()
      return updated
    })
  }

  const handleSegmentTimingChange = (segmentId: string, field: "start" | "end", value: number) => {
    setCaptionSegments((segments) => {
      const updated = segments.map((segment) => {
        if (segment.id !== segmentId) return segment
        if (field === "start") {
          const start = Math.max(0, value)
          const end = Math.max(start + 0.1, segment.end)
          return { ...segment, start, end }
        }
        const end = Math.max(value, segment.start + 0.1)
        return { ...segment, end }
      })
      persistSegmentsToBase(updated)
      invalidateRender()
      return updated
    })
  }

  const handleAddSegment = () => {
    const lastEnd = captionSegments.length ? captionSegments[captionSegments.length - 1].end : currentTime
    const start = Number.isFinite(currentTime) ? currentTime : lastEnd
    const end = start + 2
    const newSegment: CaptionSegment = {
      id: `segment_${Date.now()}`,
      start,
      end,
      text: "New caption",
    }
    // Always add to baseSegmentsRef
    baseSegmentsRef.current = [...baseSegmentsRef.current, newSegment]
    // Reshape from baseSegmentsRef for current template
    const templateForShape = selectedTemplateOption ?? defaultTemplates[0]
    setCaptionSegments(
      reshapeSegmentsForTemplate(baseSegmentsRef.current, templateForShape.renderTemplate, templateForShape.id)
    )
    setSelectedSegmentId(newSegment.id)
    seekToTime(start)
    invalidateRender()
  }

  const handleDeleteSegment = (segmentId: string) => {
    // Remove from baseSegmentsRef
    baseSegmentsRef.current = baseSegmentsRef.current.filter((segment) => segment.id !== segmentId)
    // Reshape from baseSegmentsRef for current template
    const templateForShape = selectedTemplateOption ?? defaultTemplates[0]
    setCaptionSegments(
      reshapeSegmentsForTemplate(baseSegmentsRef.current, templateForShape.renderTemplate, templateForShape.id)
    )
    if (selectedSegmentId === segmentId) {
      setSelectedSegmentId(null)
    }
    invalidateRender()
  }

  const handleCopyTranscript = useCallback(async () => {
    const transcriptText = captionSegments.map((segment) => segment.text).join("\n").trim()

    if (!transcriptText.length) {
      setCopyFeedback("No transcript available to copy.")
      return
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcriptText)
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea")
        textarea.value = transcriptText
        textarea.setAttribute("readonly", "")
        textarea.style.position = "absolute"
        textarea.style.left = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
      setCopyFeedback("Transcript copied to clipboard.")
    } catch (error) {
      console.error("Copy transcript failed", error)
      setCopyFeedback("Unable to copy transcript.")
    }
  }, [captionSegments])

  const handleTogglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }, [])

  const handleScrub = useCallback((nextTime: number) => {
    if (!Number.isFinite(nextTime)) return
    seekToTime(nextTime)
  }, [seekToTime])

  const handleSaveTranscript = async () => {
    if (!transcriptId) {
      setSaveFeedback({ variant: "error", message: "No transcript to update yet." })
      return
    }

    setIsSavingTranscript(true)
    setSaveFeedback(null)

    try {
      const payload = {
        text: captionSegments.map((segment) => segment.text).join(" "),
        language: previewLanguage,
        segments: captionSegments.map((segment) => ({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          text: segment.text,
        })),
      }

      const response = await fetch(`/api/transcripts/${transcriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to save transcript")
      }

      const nextSegments = normalizeSegments((body.transcript?.segments ?? payload.segments) as RawPreviewSegment[] | undefined)
      setCaptionSegments(nextSegments)
      setSaveFeedback({ variant: "success", message: "Transcript saved." })
    } catch (err) {
      setSaveFeedback({ variant: "error", message: err instanceof Error ? err.message : "Failed to save transcript." })
    } finally {
      setIsSavingTranscript(false)
      setTimeout(() => setSaveFeedback(null), 3200)
    }
  }

  const handleExportAction = () => {
    if (downloadUrl && jobStatus === "done") {
      void handleDownload()
      return
    }
    if (!selectedTemplateOption) return
    setShowExportModal(true)
    void enqueueRenderJob(selectedTemplateOption)
  }

  const exportButtonLabel = downloadUrl && jobStatus === "done"
    ? "Download render"
    : jobId
      ? "Rendering..."
      : "Export & Download"

  useEffect(() => {
    if (!jobId) return

    let stop = false
    const eventSource = new EventSource(`/api/jobs/${jobId}/stream`)

    eventSource.addEventListener("message", (event) => {
      if (stop) return
      try {
        const data = JSON.parse(event.data)
        const status = data.status

        setJobStatus(status)
        const progressValue = normalizeJobProgressValue(data.progress)
        if (progressValue !== null) {
          setJobProgress(progressValue)
        }

        if (status === "done") {
          eventSource.close()
          setJobProgress(1)

          // Fetch the full job details to get the download URL
          fetch(`/api/jobs/${jobId}`)
            .then(r => r.json())
            .then(payload => {
              if (stop) return
              const direct = payload.job.result?.downloadUrl ?? null
              if (direct) {
                setDownloadUrl(direct)
              } else {
                fetchRenderDownload()
                  .then(url => {
                    if (!stop) setDownloadUrl(url)
                  })
                  .catch(err => {
                    if (!stop) setJobMessage("Unable to fetch download link")
                  })
              }
              setJobMessage("Render complete.")
            })
            .catch(() => {
              if (!stop) setJobMessage("Unable to fetch render details.")
            })
        }

        if (status === "failed") {
          eventSource.close()
          fetch(`/api/jobs/${jobId}`)
            .then(r => r.json())
            .then(payload => {
              if (!stop) {
                setJobMessage(payload.job.error ?? "Render failed.")
                setDownloadUrl(null)
                setJobProgress(null)
              }
            })
            .catch(() => {
              if (!stop) setJobMessage("Render failed.")
            })
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err)
      }
    })

    eventSource.addEventListener("error", (err) => {
      if (!stop) {
        console.error("SSE connection error", err)
        eventSource.close()
        setJobMessage("Connection lost. Retrying...")
        
        // Fallback to polling if SSE fails
        const pollTimer = setInterval(async () => {
          if (stop) {
            clearInterval(pollTimer)
            return
          }
          try {
            const resp = await fetch(`/api/jobs/${jobId}`)
            if (!resp.ok) return
            const payload = await resp.json()
            const status = payload.job.status
            setJobStatus(status)
            const progressValue = normalizeJobProgressValue(payload.job.result?.progress)
            if (progressValue !== null) {
              setJobProgress(progressValue)
            }
            if (status === "done" || status === "failed") {
              clearInterval(pollTimer)
            }
          } catch (err) {
            console.error("Fallback poll error", err)
          }
        }, 1000)
      }
    })

    return () => {
      stop = true
      eventSource.close()
    }
  }, [jobId, fetchRenderDownload])

  const handleDownload = useCallback(async () => {
    if (!downloadUrl) return

    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error("Download failed")
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = buildDownloadFilename(previewTitle, uploadId)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error("Inline download failed", error)
      setJobMessage("Unable to download file inline. Please try again.")
    }
  }, [downloadUrl, previewTitle, uploadId])

  const handleCloseExportModal = () => {
    setShowExportModal(false)
  }

  const exportStatusLabel = jobStatus
    ? jobStatus.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase())
    : jobId
      ? "Preparing"
      : "Idle"

  const computedProgress = typeof jobProgress === "number"
    ? Math.round(Math.min(1, Math.max(0, jobProgress)) * 100)
    : null

  const renderProgress = computedProgress ?? (jobStatus === "done"
    ? 100
    : jobStatus === "failed"
      ? 100
      : jobStatus === "processing"
        ? 70
        : jobStatus === "queued"
          ? 45
          : jobId
            ? 20
            : 0)

  const estimatedEta = jobStatus === "done"
    ? "Render complete. You can download the file now."
    : jobStatus === "failed"
      ? "Render failed. Adjust settings and try again."
      : computedProgress !== null
        ? `Rendering... ${computedProgress}% complete.`
        : "Estimated time: ~2–3 minutes depending on video length."

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Workspace</p>
            <h1 className="text-3xl font-bold">{preview?.upload.title ?? "Preparing video..."}</h1>
            <p className="text-sm text-muted-foreground">
              {captionSegments.length} caption segments · Language {preview?.upload.language ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handleSaveTranscript}
              disabled={isSavingTranscript || !transcriptId}
            >
              {isSavingTranscript ? "Saving..." : transcriptId ? "Save transcript" : "Transcript pending"}
            </Button>
            <Button
              className="gap-2"
              onClick={handleExportAction}
              disabled={isDispatchingRender}
            >
              <Download className="h-4 w-4" />
              {exportButtonLabel}
            </Button>
          </div>
        </div>

        {previewError && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
            {previewError}
          </div>
        )}

        {saveFeedback && (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 text-sm",
              saveFeedback.variant === "success"
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-500"
                : "border-rose-500/40 bg-rose-500/5 text-rose-500",
            )}
          >
            {saveFeedback.message}
          </div>
        )}

        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-center">
          <div className="w-full max-w-[520px] h-[720px]">
            <div className="flex h-full flex-col rounded-3xl border border-border/70 bg-card/90 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Realtime preview</p>
                  <h2 className="text-xl font-semibold leading-tight">{selectedTemplateOption.name}</h2>
                  <p className="text-xs text-muted-foreground">Video stays true to its native ratio.</p>
                </div>
                <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {preview?.video.durationSeconds ? `${Math.round(preview.video.durationSeconds)}s` : "Live"}
                </span>
              </div>

              <div className="mt-4 flex h-full flex-col gap-4">
                <div className="flex min-h-[420px] flex-1 flex-col rounded-4xl border border-border/60 bg-linear-to-b from-background/80 via-background/40 to-background/20 p-4 shadow-inner">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <span>Preview surface</span>
                    <span>{preview?.upload.title ?? "Loading"}</span>
                  </div>
                  <div className="mt-4 flex flex-1 items-center justify-center">
                    {preview?.video.url ? (
                      <div className="relative mx-auto inline-flex max-h-full max-w-full items-center justify-center">
                        <video
                          ref={videoRef}
                          src={preview.video.url}
                          controls={false}
                          className="block max-h-[520px] max-w-full rounded-2xl object-contain shadow-2xl"
                          style={{ aspectRatio: videoAspectRatio }}
                          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                          onLoadedMetadata={(event) => {
                            setCurrentTime(0)
                            setVideoResolution({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
                            setVideoDuration(event.currentTarget.duration || preview?.video?.durationSeconds || 0)
                          }}
                          onClick={handleTogglePlayback}
                          onPlay={() => setIsVideoPlaying(true)}
                          onPause={() => setIsVideoPlaying(false)}
                        />
                        {selectedTemplate === "creator-kinetic" && (
                          <CreatorKineticOverlay
                            videoRef={videoRef}
                            captions={captionsForPlayer}
                            wordsOverride={overlayKineticWords}
                            currentTime={currentTime}
                            config={overlayConfig}
                            onUpdateConfiguration={handleOverlayConfigChange}
                          />
                        )}
                        {selectedTemplate === "documentary" && (
                          <SimpleCaptionOverlay segments={captionsForPlayer} currentTime={currentTime} />
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/40 text-sm text-muted-foreground">
                        Preview will appear here once processing finishes.
                      </div>
                    )}
                  </div>
                </div>

                {preview?.video.url && (
                  <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{formattedCurrentTime}</span>
                      <span>{formattedTotalDuration}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-full"
                        onClick={handleTogglePlayback}
                      >
                        {isVideoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <div className="relative flex-1 py-2">
                        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted-foreground/20" />
                        <div
                          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-all"
                          style={{ width: `${playbackProgress * 100}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
                          style={{ left: `calc(${playbackProgress * 100}% - 6px)` }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={Math.max(sliderMax, 0.1)}
                          step={0.01}
                          value={Math.min(currentTime, sliderMax)}
                          onChange={(event) => handleScrub(Number(event.target.value))}
                          className="relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent"
                          aria-label="Video timeline"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full max-w-[520px] h-[720px]">
            <div className="flex h-full flex-col rounded-3xl border border-border/70 bg-card/90 p-6 shadow-xl overflow-hidden">
              <Tabs defaultValue="captions" className="flex h-full flex-col">
                <div className="flex flex-col gap-2 flex-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Timeline</p>
                      <h2 className="text-xl font-semibold">Word editor</h2>
                      <p className="text-sm text-muted-foreground">Edit per-line captions and timings.</p>
                    </div>
                    <Button size="icon" variant="outline" className="rounded-full" onClick={handleCopyTranscript}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copyFeedback && <p className="text-xs font-medium text-emerald-500">{copyFeedback}</p>}
                  <TabsList className="flex w-full gap-1 rounded-2xl bg-muted/40 p-1">
                    <TabsTrigger
                      value="captions"
                      className="flex-1 rounded-2xl text-xs font-semibold uppercase tracking-wide"
                    >
                      Word editor
                    </TabsTrigger>
                    <TabsTrigger
                      value="templates"
                      className="flex-1 rounded-2xl text-xs font-semibold uppercase tracking-wide"
                    >
                      Templates
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="mt-4 flex-1 overflow-hidden">
                  <TabsContent value="captions" className="flex h-full flex-col overflow-hidden">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search words..."
                        className="pl-9"
                      />
                    </div>

                    <div className="mt-4 flex-1 overflow-hidden">
                      <div className="h-full overflow-y-auto rounded-2xl border border-border/70 bg-background/70 p-4">
                        {filteredSegments.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                            No captions match that search.
                          </div>
                        )}

                        <div className="space-y-3 pr-1">
                          {filteredSegments.map((segment) => {
                            const isActive = selectedSegmentId === segment.id
                            return (
                              <div
                                key={segment.id}
                                className={cn(
                                  "rounded-2xl border p-3 transition",
                                  isActive ? "border-primary bg-primary/5" : "border-border bg-background/60",
                                )}
                                onClick={() => {
                                  setSelectedSegmentId(segment.id)
                                  seekToTime(segment.start)
                                }}
                              >
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>
                                    {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        seekToTime(segment.start)
                                      }}
                                    >
                                      <Play className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-rose-500"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleDeleteSegment(segment.id)
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <textarea
                                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background/70 p-2.5 text-sm focus:border-primary focus:outline-none"
                                  rows={2}
                                  value={segment.text}
                                  onChange={(event) => handleSegmentChange(segment.id, { text: event.target.value })}
                                />

                                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                  <label className="space-y-1 text-muted-foreground">
                                    <span className="block uppercase tracking-wide">Start</span>
                                    <Input
                                      type="number"
                                      value={segment.start.toFixed(2)}
                                      step={0.1}
                                      min={0}
                                      onChange={(event) => {
                                        const nextValue = Number(event.target.value)
                                        if (Number.isNaN(nextValue)) return
                                        handleSegmentTimingChange(segment.id, "start", nextValue)
                                      }}
                                      className="text-sm"
                                    />
                                  </label>
                                  <label className="space-y-1 text-muted-foreground">
                                    <span className="block uppercase tracking-wide">End</span>
                                    <Input
                                      type="number"
                                      value={segment.end.toFixed(2)}
                                      step={0.1}
                                      min={segment.start + 0.1}
                                      onChange={(event) => {
                                        const nextValue = Number(event.target.value)
                                        if (Number.isNaN(nextValue)) return
                                        handleSegmentTimingChange(segment.id, "end", nextValue)
                                      }}
                                      className="text-sm"
                                    />
                                  </label>
                                </div>

                                {isActive && <p className="mt-2 text-xs font-semibold text-primary">Live now</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-dashed border-border/70"
                      onClick={handleAddSegment}
                    >
                      <Plus className="h-4 w-4" />
                      Add caption
                    </Button>
                  </TabsContent>

                  <TabsContent value="templates" className="h-full overflow-hidden">
                    <div className="flex h-full flex-col rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Template switcher</p>
                        <p className="text-sm text-muted-foreground">Swap looks while staying in the timeline.</p>
                      </div>
                      <div className="mt-4 flex-1 overflow-y-auto pr-1">
                        <TemplateSelector
                          templates={defaultTemplates}
                          selectedTemplateId={selectedTemplate}
                          onSelect={handleTemplateSelect}
                          isProcessing={isApplyingTemplate || isPreviewLoading}
                        />
                      </div>
                      <p className="mt-4 text-xs text-muted-foreground">Changes apply instantly to the live preview.</p>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>

        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <button
                type="button"
                onClick={handleCloseExportModal}
                className="absolute right-5 top-5 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Close
              </button>
              <div className="flex flex-col gap-2 pr-10">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Export status</p>
                <h3 className="text-2xl font-semibold leading-tight">
                  {jobStatus === "done" ? "Render ready" : jobStatus === "failed" ? "Render failed" : "Rendering your video"}
                </h3>
                <p className="text-sm text-muted-foreground">{estimatedEta}</p>
              </div>

              <div className="mt-6 space-y-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">File</span>
                <p className="truncate font-medium">
                  {preview?.upload.title ?? `Upload ${uploadId}`}
                </p>
              </div>

              <div className="mt-4 space-y-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                <p className="font-medium">{exportStatusLabel}</p>
                {jobMessage && <p className="text-xs text-muted-foreground">{jobMessage}</p>}
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Progress</span>
                  <span>{renderProgress}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-border/70">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${renderProgress}%` }}
                  />
                </div>
              </div>

              {downloadUrl && jobStatus === "done" ? (
                <Button className="mt-6 w-full" onClick={() => void handleDownload()}>
                  Download render
                </Button>
              ) : (
                <div className="mt-6 text-xs text-muted-foreground">
                  We’ll notify you once the download link is ready.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function normalizeSegments(rawSegments?: RawPreviewSegment[] | null): CaptionSegment[] {
  if (!Array.isArray(rawSegments) || !rawSegments.length) {
    return []
  }

  return rawSegments.map((segment, index) => {
    const startCandidate =
      typeof segment.start === "number"
        ? segment.start
        : typeof segment.start_time === "number"
          ? segment.start_time
          : index * 2
    const safeText = typeof segment.text === "string" ? segment.text : ""
    const endCandidate =
      typeof segment.end === "number"
        ? segment.end
        : typeof segment.end_time === "number"
          ? segment.end_time
          : startCandidate + Math.max(safeText.length / 12, 1.2)

    const start = Number.isFinite(startCandidate) ? Number(startCandidate) : index * 2
    const end = Number.isFinite(endCandidate) && endCandidate > start ? Number(endCandidate) : start + 1.2

    const normalizedWords = Array.isArray(segment.words)
        ? segment.words
          .map((word) => {
            const text = typeof word.text === "string" ? word.text : typeof word.word === "string" ? word.word : ""
            if (!text.trim()) {
              return null
            }

            const start = Number.isFinite(word.start) ? Number(word.start) : undefined
            const end = Number.isFinite(word.end) ? Number(word.end) : undefined
            if (typeof start !== "number" || typeof end !== "number" || end <= start) {
              return null
            }

            return {
              start,
              end,
              text,
            }
          })
          .filter((word): word is CaptionWord => Boolean(word?.text))
      : undefined

    return {
      id: segment.id ? String(segment.id) : `segment_${index}`,
      start,
      end,
      text: safeText,
      ...(normalizedWords?.length ? { words: normalizedWords } : {}),
    }
  })
}

const CREATOR_KINETIC_CHUNK_SIZE = 3

function reshapeSegmentsForTemplate(
  segments: CaptionSegment[],
  renderTemplate: TemplateOption["renderTemplate"],
  templateId?: string,
): CaptionSegment[] {
  if (!segments.length) {
    return segments
  }

  const requiresKineticChunks = templateId === "creator-kinetic" || renderTemplate === "karaoke"
  if (!requiresKineticChunks) {
    return cloneSegments(segments)
  }

  const reshaped: CaptionSegment[] = []
  segments.forEach((segment) => {
    const words = ensureSegmentWords(segment)
    if (!words.length || words.length <= CREATOR_KINETIC_CHUNK_SIZE) {
      reshaped.push({
        ...segment,
        text: buildTextFromWords(words, segment.text),
        words,
      })
      return
    }

    let chunkIndex = 0
    for (let cursor = 0; cursor < words.length; cursor += CREATOR_KINETIC_CHUNK_SIZE) {
      const chunkWords = words.slice(cursor, cursor + CREATOR_KINETIC_CHUNK_SIZE).map(cloneWord)
      const chunkStart = chunkWords[0]?.start ?? segment.start + cursor * 0.5
      const chunkEnd = chunkWords.at(-1)?.end ?? chunkStart + 0.8
      reshaped.push({
        id: `${segment.id}_ck_${chunkIndex}`,
        start: chunkStart,
        end: Math.max(chunkEnd, chunkStart + 0.2),
        text: buildTextFromWords(chunkWords, segment.text),
        words: chunkWords,
      })
      chunkIndex += 1
    }
  })

  return reshaped
}

function mergeChunkedSegments(segments: CaptionSegment[]): CaptionSegment[] {
  const grouped = new Map<string, CaptionSegment[]>()

  segments.forEach((segment) => {
    const id = String(segment.id)
    const baseId = id.includes("_ck_") ? id.split("_ck_")[0] : id
    const collection = grouped.get(baseId) ?? []
    collection.push(segment)
    grouped.set(baseId, collection)
  })

  return Array.from(grouped.entries()).map(([baseId, group]) => {
    if (group.length === 1 && String(group[0].id) === baseId) {
      return cloneSegment(group[0])
    }

    const sorted = [...group].sort((a, b) => a.start - b.start)
    const mergedWords = sorted.flatMap((segment) => segment.words ?? []).map(cloneWord)
    const mergedText = mergedWords.length
      ? mergedWords.map((word) => word.text).join(" ")
      : sorted.map((segment) => segment.text).join(" ")

    const templateSegment = cloneSegment(sorted[0])
    const merged: CaptionSegment = {
      ...templateSegment,
      id: baseId,
      start: sorted[0].start,
      end: sorted[sorted.length - 1].end,
      text: mergedText,
    }

    if (mergedWords.length) {
      merged.words = mergedWords
    } else {
      delete merged.words
    }

    return merged
  })
}

function normalizeJobProgressValue(value?: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(numeric)) {
    return null
  }

  if (numeric > 1) {
    return Math.min(1, Math.max(0, numeric / 100))
  }

  return Math.min(1, Math.max(0, numeric))
}

function buildDownloadFilename(title?: string | null, uploadId?: string | null): string {
  const fallback = uploadId ? `render-${uploadId.slice(0, 8)}` : "rendered-video"
  const base = title && title.trim().length ? title.trim() : fallback
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

  return `${safe || fallback}.mp4`
}

function ensureSegmentWords(segment: CaptionSegment): CaptionWord[] {
  if (segment.words?.length) {
    return segment.words.map(cloneWord)
  }

  const tokens = segment.text?.split(/\s+/).map((token) => token.trim()).filter(Boolean) ?? []
  if (!tokens.length) {
    return []
  }

  const duration = Math.max(segment.end - segment.start, tokens.length * 0.25)
  const perToken = duration / tokens.length

  return tokens.map((token, index) => ({
    text: token,
    start: Number(segment.start + perToken * index),
    end: Number(segment.start + perToken * (index + 1)),
  }))
}

function buildTextFromWords(words: CaptionWord[], fallback: string) {
  if (!words?.length) {
    return fallback
  }
  return words.map((word) => word.text).join(" ")
}

function cloneSegments(segments: CaptionSegment[]): CaptionSegment[] {
  return segments.map(cloneSegment)
}

function cloneSegment(segment: CaptionSegment): CaptionSegment {
  return {
    ...segment,
    words: segment.words?.map(cloneWord),
  }
}

function cloneWord(word: CaptionWord): CaptionWord {
  return { ...word }
}

function formatTimestamp(value: number) {
  if (!Number.isFinite(value)) return "0:00"
  const mins = Math.floor(value / 60)
  const secs = Math.floor(value % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function createDefaultOverlayConfig(): OverlayConfig {
  return {
    scale: 3.35,
    x: 50,
    y: 50,
  }
}
