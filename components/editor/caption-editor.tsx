"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface CaptionEditorProps {
  caption: any
  onUpdate: (updates: any) => void
  onDelete: () => void
}

export function CaptionEditor({ caption, onUpdate, onDelete }: CaptionEditorProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="p-6 space-y-6 h-full">
      <div>
        <label className="block text-sm font-medium mb-2">Caption Text</label>
        <textarea
          value={caption.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Start Time</label>
          <Input
            type="number"
            value={caption.start_time}
            onChange={(e) => onUpdate({ start_time: Number.parseFloat(e.target.value) })}
            step="0.1"
            min="0"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">{formatTime(caption.start_time)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End Time</label>
          <Input
            type="number"
            value={caption.end_time}
            onChange={(e) => onUpdate({ end_time: Number.parseFloat(e.target.value) })}
            step="0.1"
            min={caption.start_time}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">{formatTime(caption.end_time)}</p>
        </div>
      </div>

      <Button variant="destructive" className="w-full gap-2" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
        Delete Caption
      </Button>
    </div>
  )
}
