export type TemplateStyle = {
  container: string
  wrapper: string
  text: string
  uppercase?: boolean
  showWordBadges?: boolean
  wordPrimary?: string
  wordSecondary?: string
  wordHighlightStrategy?: "first" | "none"
}

export const templateStyles: Record<string, TemplateStyle> = {
  "modern-bold": {
    container: "bg-black/0 backdrop-blur",
    wrapper: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white",
    text: "text-3xl font-black tracking-wide drop-shadow-lg",
    uppercase: true,
    showWordBadges: true,
    wordPrimary: "bg-lime-400 text-black",
    wordSecondary: "bg-white/90 text-black",
    wordHighlightStrategy: "first",
  },
  "minimal-clean": {
    container: "bg-black/0 backdrop-blur",
    wrapper: "bg-white/90 text-black",
    text: "text-xl font-semibold",
  },
  "creator-kinetic": {
    container: "bg-black/0",
    wrapper: "bg-black/80 text-white border border-lime-400 shadow-[0_0_40px_rgba(57,255,20,0.5)]",
    text: "text-2xl font-bold tracking-wide",
    showWordBadges: true,
    wordPrimary: "bg-lime-400 text-black",
    wordSecondary: "bg-transparent text-white",
    wordHighlightStrategy: "first",
  },
  documentary: {
    container: "bg-black/0",
    wrapper: "bg-black/75 text-white",
    text: "text-lg font-medium",
  },
  glowy: {
    container: "bg-black/0 backdrop-blur",
    wrapper: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white",
    text: "text-3xl font-black tracking-wide drop-shadow-lg",
    uppercase: true,
    showWordBadges: true,
    wordPrimary: "bg-yellow-300 text-black",
    wordSecondary: "bg-white/90 text-black",
    wordHighlightStrategy: "first",
  },
  minimal: {
    container: "bg-black/0",
    wrapper: "bg-white/95 text-black",
    text: "text-xl font-semibold",
  },
  karaoke: {
    container: "bg-black/0",
    wrapper: "bg-black/80 text-white border border-white/30",
    text: "text-2xl font-semibold",
    showWordBadges: true,
    wordPrimary: "text-white font-bold",
    wordSecondary: "text-white/70",
    wordHighlightStrategy: "first",
  },
  default: {
    container: "bg-black/20",
    wrapper: "bg-black/80 text-white",
    text: "text-lg font-semibold",
  },
}

export function getTemplateStyle(id?: string | null): TemplateStyle {
  const key = id ?? "default"
  return templateStyles[key] ?? templateStyles.default
}
