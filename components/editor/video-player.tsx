"use client"

import { useRef, useEffect, useState, useMemo } from "react"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { type CaptionSegment, type CaptionTemplate, type CaptionWord } from "@/lib/pipeline"
import { Templates } from "@/components/templates/data"
import { CanvasCaptionRenderer } from "@/components/editor/canvas-caption-renderer"

type PlayerCaption = CaptionSegment & {
  start_time?: number
  end_time?: number
}

interface VideoPlayerProps {
  videoUrl: string
  currentTime: number
  onTimeChange: (time: number) => void
  captions: PlayerCaption[]
  className?: string
  frameClassName?: string
  templatePreviewId?: string
  templateStyle?: CaptionTemplate
}

export function VideoPlayer({
  videoUrl,
  currentTime,
  onTimeChange,
  captions,
  className,
  frameClassName,
  templatePreviewId,
  templateStyle,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateCurrentTime = () => {
      onTimeChange(video.currentTime)
    }

    const updateDuration = () => {
      setDuration(video.duration)
    }

    video.addEventListener("timeupdate", updateCurrentTime)
    video.addEventListener("loadedmetadata", updateDuration)

    return () => {
      video.removeEventListener("timeupdate", updateCurrentTime)
      video.removeEventListener("loadedmetadata", updateDuration)
    }
  }, [onTimeChange])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = currentTime
    }
  }, [currentTime])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const templateObj = useMemo(() => {
    const id = templatePreviewId ?? (typeof templateStyle === "string" ? templateStyle : "minimal")
    return Templates[id] ?? Templates.minimal
  }, [templatePreviewId, templateStyle])

  return (
    <div className={cn("p-6 space-y-4 flex-1 flex flex-col bg-card/50", className)}>
      <div
        className={cn(
          "flex-1 bg-black rounded-lg overflow-hidden relative flex items-center justify-center",
          frameClassName,
        )}
      >
        <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" muted={isMuted} />

        {/* Caption Overlay */}
        <CanvasCaptionRenderer
          videoRef={videoRef}
          captions={captions}
          template={templateObj}
        />

        {/* Play Button Overlay */}
        {!isPlaying && (
          <Button size="lg" variant="ghost" className="absolute rounded-full" onClick={togglePlay}>
            <Play className="w-12 h-12 text-white fill-white" />
          </Button>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Button size="sm" variant="outline" onClick={togglePlay} className="gap-2 bg-transparent">
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Play
              </>
            )}
          </Button>

          <div className="flex-1">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={(value) => onTimeChange(value[0])}
              className="w-full"
            />
          </div>

          <span className="text-sm text-muted-foreground min-w-12">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <Button size="sm" variant="outline" onClick={() => setIsMuted(!isMuted)}>
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

