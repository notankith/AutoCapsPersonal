import { CaptionTemplate, TemplateOption } from "./types"

export const Templates: Record<string, CaptionTemplate> = {
  minimal: {
    name: "Minimal",
    fontFamily: "Inter",
    fontSize: 40,
    primaryColor: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 2,
    shadowColor: "#00000080",
    shadowWidth: 0,
    alignment: 2,
    marginV: 40,
  },
  glowy: {
    name: "Glowy",
    fontFamily: "Inter",
    fontSize: 62,
    primaryColor: "#FFFFFF",
    outlineColor: "#00000080",
    outlineWidth: 5,
    shadowColor: "#000000",
    shadowWidth: 18,
    alignment: 5,
    marginV: 40,
  },
  karaoke: {
    name: "CreatorKinetic",
    fontFamily: "Retro Dream Display Free Demo",
    fontSize: 68,
    primaryColor: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 6,
    shadowColor: "#000000",
    shadowWidth: 12,
    alignment: 5,
    marginV: 50,
    uppercase: true,
    karaoke: {
      highlightColor: "#FFFF40",
      mode: "word",
    },
  },
  sportGlow: {
    name: "SportGlow",
    fontFamily: "Anton",
    fontSize: 82,
    primaryColor: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 8,
    shadowColor: "#000000",
    shadowWidth: 20,
    alignment: 5,
    marginV: 50,
    uppercase: true,
    karaoke: {
      highlightColor: "#FFFF40",
      mode: "word",
    },
  },
}

export const defaultTemplates: TemplateOption[] = [
  {
    id: "modern-bold",
    name: "Modern Bold",
    description: "High-contrast title cards plus bold, centered captions.",
    accent: "#8b5cf6",
    background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    badge: "Popular",
    renderTemplate: "glowy",
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Lightweight lower-thirds with system fonts and subtle fades.",
    accent: "#10b981",
    background: "linear-gradient(120deg, #6ee7b7 0%, #3b82f6 100%)",
    renderTemplate: "minimal",
  },
  {
    id: "creator-kinetic",
    name: "Creator Kinetic",
    description:
      "RetroDream serif TikTok-style: zoom-in sentences, per-word neon glow, and kinetic timing.",
    accent: "#39FF14",
    background:
      "linear-gradient(135deg, #0f172a 0%, #111111 40%, #39ff14 100%)",
    badge: "Sports",
    renderTemplate: "karaoke",
  },
  {
    id: "documentary",
    name: "Documentary",
    description: "Classic subtitle treatment with background plate and safe margins.",
    accent: "#0ea5e9",
    background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)",
    renderTemplate: "minimal",
  },
]

export function findTemplateById(id?: string | null) {
  return defaultTemplates.find((template) => template.id === id) ?? defaultTemplates[0]
}
