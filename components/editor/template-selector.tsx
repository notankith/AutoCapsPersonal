"use client"

import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
          if (isProcessing) {
            return
          }
          onSelect(template.id)
        }
        return (
          <Card
            key={template.id}
            role="button"
            tabIndex={0}
            onClick={handleSelect}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !isProcessing) {
                event.preventDefault()
                handleSelect()
              }
            }}
            className={cn(
              "relative overflow-hidden border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isProcessing ? "cursor-not-allowed opacity-80" : "cursor-pointer",
              isActive ? "border-primary shadow-lg" : "border-border",
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{ background: template.background }}
              aria-hidden="true"
            />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{template.name}</span>
                {template.badge && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">{template.badge}</span>
                )}
              </CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-32 rounded-xl border border-dashed border-border bg-background/70 p-4">
                <div className="flex h-full flex-col justify-between">
                  <div className="h-3 w-3/4 rounded-full" style={{ background: template.accent }} />
                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-foreground/10" />
                    <div className="h-2 w-5/6 rounded-full bg-foreground/10" />
                    <div className="h-2 w-2/3 rounded-full bg-foreground/10" />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isActive ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>Selected</span>
                  </>
                ) : (
                  <span>Render with this look</span>
                )}
              </div>
              <Button
                size="sm"
                variant={isActive ? "default" : "outline"}
                disabled={isProcessing}
                onClick={(event) => {
                  event.stopPropagation()
                  handleSelect()
                }}
              >
                {isActive ? "Selected" : "Use template"}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
