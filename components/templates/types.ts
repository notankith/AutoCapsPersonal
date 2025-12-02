export interface CaptionTemplate {
  name: string
  fontFamily: string
  fontSize: number
  primaryColor: string
  outlineColor: string
  outlineWidth: number
  shadowColor: string
  shadowWidth: number
  alignment: number
  marginV: number
  uppercase?: boolean
  karaoke?: {
    // Single highlightColor kept for backwards compatibility
    highlightColor?: string
    // Optional list of colors to cycle through for karaoke highlighting
    highlightColors?: string[]
    // Number of chunks to show before cycling to the next color (default 2)
    cycleAfterChunks?: number
    mode: "word" | "syllable"
  }
}

export type TemplateOption = {
  id: string
  name: string
  description: string
  accent: string
  background: string
  badge?: string
  renderTemplate: string
  previewImage?: string
}
