"use client"

import Image from "next/image"
import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type TemplateOption } from "@/components/templates/types"

interface TemplateSelectorProps {
  templates: TemplateOption[]
  selectedTemplateId?: string
  onSelect: (templateId: string) => void
  isProcessing?: boolean
}

export function TemplateSelector({ templates, selectedTemplateId, onSelect, isProcessing }: TemplateSelectorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {templates.map((template) => {
        const isActive = template.id === selectedTemplateId

        const handleSelect = () => {
          if (isProcessing) return
          onSelect(template.id)
        }

        return (
          <button
            key={template.id}
            type="button"
            onClick={handleSelect}
            disabled={isProcessing}
            aria-pressed={isActive}
            className={cn(
              "group relative w-full overflow-hidden rounded-3xl border-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isProcessing ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:-translate-y-0.5",
              isActive ? "border-primary shadow-xl" : "border-transparent",
            )}
          >
            <div className="relative h-60 w-full">
              {template.previewImage ? (
                <Image
                  src={template.previewImage}
                  alt={`${template.name} preview`}
                  fill
                  sizes="(min-width: 768px) 45vw, 90vw"
                  className="object-cover"
                  priority={template.id === selectedTemplateId}
                />
              ) : (
                <div className="h-full w-full" style={{ background: template.background }} />
              )}
              <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/40 to-black/80" />
              {isActive && <div className="pointer-events-none absolute inset-0 border-4 border-primary/60" />}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-2xl bg-black/50 px-4 py-3 text-white backdrop-blur">
                <div className="max-w-[70%]">
                  <p className="text-sm font-semibold leading-tight">{template.name}</p>
                  <p className="text-xs text-white/80 line-clamp-2">{template.description}</p>
                </div>
                {isActive ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : template.badge ? (
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/80">{template.badge}</span>
                ) : null}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
