"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

interface CaptionEditorProps {
  caption: any
  onUpdate: (updates: any) => void
  onDelete: () => void
}

function DebouncedInput({ 
  value, 
  onChange, 
  type = "text", 
  ...props 
}: { 
  value: string | number
  onChange: (val: string) => void
  type?: string
  [key: string]: any 
}) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  return (
    <Input
      {...props}
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => onChange(localValue.toString())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onChange(localValue.toString())
          e.currentTarget.blur()
        }
      }}
    />
  )
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
          <DebouncedInput
            type="number"
            value={caption.start_time || caption.start}
            onChange={(val) => onUpdate({ start: Number.parseFloat(val) })}
            step="0.1"
            min="0"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">{formatTime(caption.start_time || caption.start)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End Time</label>
          <DebouncedInput
            type="number"
            value={caption.end_time || caption.end}
            onChange={(val) => onUpdate({ end: Number.parseFloat(val) })}
            step="0.1"
            min={caption.start_time || caption.start}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">{formatTime(caption.end_time || caption.end)}</p>
        </div>
      </div>

      <Button variant="destructive" className="w-full gap-2" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
        Delete Caption
      </Button>
    </div>
  )
}
