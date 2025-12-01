"use client"

import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
// import { VideoPlayer } from "./video-player"
import { TemplateSelector } from "./template-selector"
import { type TemplateOption } from "@/components/templates/types"
import { defaultTemplates, findTemplateById } from "@/components/templates/data"
import { Loader2, Layers, CheckCircle2, Download, AlertTriangle, Plus, Search, Play, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type CaptionSegment, type CaptionWord } from "@/lib/pipeline"
import { KineticCaptionOverlay, SimpleCaptionOverlay } from "./caption-overlays"

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
  const [templateStatus, setTemplateStatus] = useState<string | null>(null)
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false)
  const [isDispatchingRender, setIsDispatchingRender] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [jobMessage, setJobMessage] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([])
  // Store the base, user-edited segments (never chunked)
  const baseSegmentsRef = useRef<CaptionSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentTime, setCurrentTime] = useState(0)
  const [isSavingTranscript, setIsSavingTranscript] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<{ variant: "success" | "error"; message: string } | null>(null)

  const [transcriptId, setTranscriptId] = useState<string | null>(null)

  const selectedTemplateOption =
    defaultTemplates.find((t) => t.id === selectedTemplate) ?? defaultTemplates[0]
  const previewLanguage = preview?.transcript.language ?? preview?.upload.language ?? "en"

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

  const captionsForPlayer = captionSegments

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

      try {
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
        throw err
      } finally {
        setIsDispatchingRender(false)
      }
    },
    [uploadId, captionSegments, transcriptId]
  )

  const handleTemplateSelect = async (templateId: string) => {
    const template = defaultTemplates.find((t) => t.id === templateId)
    if (!template) return

    setSelectedTemplate(templateId)
    // Always reshape from baseSegmentsRef (user-edited, never chunked)
    setCaptionSegments(reshapeSegmentsForTemplate(baseSegmentsRef.current, template.renderTemplate, template.id))
    setTemplateStatus("Applying template...")
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

      setTemplateStatus("Template applied. Preview updated — click Export & Download when ready.")
      setDownloadUrl(null)
      setJobMessage("Template updated. Click Export & Download to burn captions.")
      if (jobId) {
        setJobId(null)
        setJobStatus(null)
      }
    } catch (err) {
      setTemplateStatus(err instanceof Error ? err.message : "Could not update template.")
    } finally {
      setIsApplyingTemplate(false)
    }
  }

  const handleSegmentChange = (segmentId: string, patch: Partial<CaptionSegment>) => {
    setCaptionSegments((segments) => {
      // Update both the current segments and the base segments
      const updated = segments.map((segment) =>
        segment.id === segmentId
          ? {
              ...segment,
              ...patch,
            }
          : segment,
      )
      // If not currently using kinetic template, update baseSegmentsRef
      const selectedTemplateObj = defaultTemplates.find((t) => t.id === selectedTemplate)
      const isKinetic = selectedTemplateObj?.id === "creator-kinetic" || selectedTemplateObj?.renderTemplate === "karaoke"
      if (!isKinetic) {
        baseSegmentsRef.current = updated
      } else {
        // For kinetic, update baseSegmentsRef by mapping chunked segments back to originals
        // This is a best-effort: if chunked, only update matching originals
        // (Assumes chunked segment ids contain original id as prefix)
        const originals = baseSegmentsRef.current.map((orig) => {
          const match = updated.find((seg) => String(seg.id).startsWith(String(orig.id)))
          return match ? { ...orig, ...patch } : orig
        })
        baseSegmentsRef.current = originals
      }
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
      // Update baseSegmentsRef as above
      const selectedTemplateObj = defaultTemplates.find((t) => t.id === selectedTemplate)
      const isKinetic = selectedTemplateObj?.id === "creator-kinetic" || selectedTemplateObj?.renderTemplate === "karaoke"
      if (!isKinetic) {
        baseSegmentsRef.current = updated
      } else {
        const originals = baseSegmentsRef.current.map((orig) => {
          const match = updated.find((seg) => String(seg.id).startsWith(String(orig.id)))
          return match ? { ...orig, ...match } : orig
        })
        baseSegmentsRef.current = originals
      }
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
    const selectedTemplateObj = defaultTemplates.find((t) => t.id === selectedTemplate)
    setCaptionSegments(reshapeSegmentsForTemplate(baseSegmentsRef.current, selectedTemplateObj?.renderTemplate, selectedTemplateObj?.id))
    setSelectedSegmentId(newSegment.id)
    setCurrentTime(start)
  }

  const handleDeleteSegment = (segmentId: string) => {
    // Remove from baseSegmentsRef
    baseSegmentsRef.current = baseSegmentsRef.current.filter((segment) => segment.id !== segmentId)
    // Reshape from baseSegmentsRef for current template
    const selectedTemplateObj = defaultTemplates.find((t) => t.id === selectedTemplate)
    setCaptionSegments(reshapeSegmentsForTemplate(baseSegmentsRef.current, selectedTemplateObj?.renderTemplate, selectedTemplateObj?.id))
    if (selectedSegmentId === segmentId) {
      setSelectedSegmentId(null)
    }
  }

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
      handleDownload()
      return
    }
    if (!selectedTemplateOption) return
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
    let pollTimer: any = null

    const poll = async () => {
      if (stop) return
      try {
        const resp = await fetch(`/api/jobs/${jobId}`)
        if (!resp.ok) throw new Error("Unable to fetch job status")

        const payload = await resp.json()
        const status = payload.job.status

        setJobStatus(status)

        if (status === "done") {
          clearInterval(pollTimer)

          const direct = payload.job.result?.downloadUrl ?? null
          if (direct) {
            setDownloadUrl(direct)
          } else {
            try {
              const url = await fetchRenderDownload()
              if (!stop) setDownloadUrl(url)
            } catch (err) {
              if (!stop) setJobMessage("Unable to fetch download link")
            }
          }

          setJobMessage("Render complete.")
        }

        if (status === "failed") {
          clearInterval(pollTimer)
          setJobMessage(payload.job.error ?? "Render failed.")
          setDownloadUrl(null)
        }
      } catch (err) {
        if (!stop) {
          setJobMessage(err instanceof Error ? err.message : "Polling error")
        }
      }
    }

    pollTimer = setInterval(poll, 2500)
    poll()

    return () => {
      stop = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [jobId, fetchRenderDownload])

  const handleDownload = () => {
    if (downloadUrl) window.open(downloadUrl, "_blank", "noopener,noreferrer")
  }

  const statusIcon =
    jobStatus === "done" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    ) : jobStatus === "failed" ? (
      <AlertTriangle className="h-5 w-5 text-amber-500" />
    ) : jobId ? (
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    ) : downloadUrl ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    ) : (
      <Layers className="h-5 w-5 text-muted-foreground" />
    )

  const currentStatus = jobId
    ? jobStatus ?? "queued"
    : downloadUrl
      ? "Rendered video ready"
      : "Waiting for you to render"

  const renderQuickStats = (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Render status</p>
          <h2 className="text-xl font-semibold">Process & download</h2>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 text-lg font-semibold">
        {statusIcon}
        <span className="capitalize">{currentStatus}</span>
      </div>
      {jobMessage && <p className="mt-2 text-sm text-muted-foreground">{jobMessage}</p>}

      {!jobId && !downloadUrl && (
        <p className="mt-2 text-sm text-muted-foreground">
          When the preview looks perfect, press “Export & Download” to burn captions via FFmpeg.
        </p>
      )}

      {downloadUrl && jobStatus === "done" && (
        <Button onClick={handleDownload} className="mt-4 gap-2">
          <Download className="h-4 w-4" />
          Download latest render
        </Button>
      )}

      {jobStatus === "failed" && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => enqueueRenderJob(selectedTemplateOption)}
          disabled={isDispatchingRender}
        >
          Retry render
        </Button>
      )}
    </div>
  )

  return (
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.8fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Realtime preview</p>
                <h2 className="text-xl font-semibold">{selectedTemplateOption.name}</h2>
                <p className="text-sm text-muted-foreground">Choose a platform style below.</p>
              </div>
            </div>
            {templateStatus && <p className="mt-3 text-sm text-muted-foreground">{templateStatus}</p>}

            <div className="mt-6 rounded-[32px] border border-border/60 bg-background/40 p-4">
              {preview?.video.url ? (
                <div className="relative aspect-[9/16] max-w-xs md:max-w-sm mx-auto rounded-[28px] border border-border bg-black shadow-2xl overflow-hidden">
                  <video
                    src={preview.video.url}
                    controls
                    className="w-full h-full object-contain"
                    onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={e => setCurrentTime(0)}
                  />
                  {/* Caption overlay for Creator Kinetics */}
                  {selectedTemplate === "creator-kinetic" && (
                    <KineticCaptionOverlay
                      segments={captionsForPlayer}
                      currentTime={currentTime}
                    />
                  )}
                  {/* Caption overlay for Documentary (simple) */}
                  {selectedTemplate === "documentary" && (
                    <SimpleCaptionOverlay
                      segments={captionsForPlayer}
                      currentTime={currentTime}
                    />
                  )}
                </div>
              ) : (
                <div className="aspect-[9/16] max-w-sm mx-auto rounded-[28px] border border-dashed border-border/70 bg-muted/40" />
              )}
            </div>



            <div className="mt-6 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Templates</p>
                <h3 className="text-lg font-semibold">Pick a look</h3>
                <p className="text-sm text-muted-foreground">Tap a card to update the preview instantly.</p>
              </div>
              <TemplateSelector
                templates={defaultTemplates}
                selectedTemplateId={selectedTemplate}
                onSelect={handleTemplateSelect}
                isProcessing={isApplyingTemplate || isPreviewLoading}
              />
            </div>
          </div>

          {renderQuickStats}
        </div>

        <div className="rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg flex h-full flex-col">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Timeline</p>
              <h2 className="text-xl font-semibold">Word editor</h2>
              <p className="text-sm text-muted-foreground">Edit per-line captions and timings.</p>
            </div>
            <Button size="icon" variant="outline" className="rounded-full" onClick={handleAddSegment}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search words..."
              className="pl-9"
            />
          </div>

          <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredSegments.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No captions match that search.
              </div>
            )}

            {filteredSegments.map((segment) => {
              const isActive = selectedSegmentId === segment.id
              const isPlaying = currentTime >= segment.start && currentTime <= segment.end
              return (
                <div
                  key={segment.id}
                  className={cn(
                    "rounded-2xl border p-4 transition",
                    isActive ? "border-primary bg-primary/5" : "border-border bg-background/60",
                  )}
                  onClick={() => {
                    setSelectedSegmentId(segment.id)
                    setCurrentTime(segment.start)
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
                          setCurrentTime(segment.start)
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
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-background/70 p-3 text-sm focus:border-primary focus:outline-none"
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

                  {isPlaying && <p className="mt-2 text-xs font-semibold text-primary">Live now</p>}
                </div>
              )
            })}
          </div>

          <Button variant="outline" className="mt-4 gap-2" onClick={handleAddSegment}>
            <Plus className="h-4 w-4" />
            Add caption
          </Button>
        </div>
      </div>
    </div>
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
