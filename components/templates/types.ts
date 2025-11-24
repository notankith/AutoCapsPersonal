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
    highlightColor: string
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
}
