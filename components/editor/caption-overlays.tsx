import React from "react"

import type { CaptionSegment, CaptionWord } from "@/lib/pipeline"

interface KineticCaptionOverlayProps {
  segments: CaptionSegment[]
  currentTime: number
}

export function KineticCaptionOverlay({ segments, currentTime }: KineticCaptionOverlayProps) {
  // Find the active segment
  const active = segments.find((seg: CaptionSegment) => currentTime >= seg.start && currentTime <= seg.end)
  if (!active || !active.words || !active.words.length) return null

  // Creator Kinetics overlay settings
  const fontSize = 58
  const marginV = 50
  const highlightColors = ["#70e2ff", "#ffe83f", "#9fff5b"]
  const cycleAfterChunks = 2
  const words = active.words

  // Color cycling logic
  let chunkIdx = 0
  let colorIdx = 0
  let colorMap = []
  for (let i = 0; i < words.length; i += 3) {
    colorMap.push(highlightColors[colorIdx])
    chunkIdx++
    if (chunkIdx % cycleAfterChunks === 0) colorIdx = (colorIdx + 1) % highlightColors.length
  }

  // PURE HTML rendering with forced font and glow via inline styles
  return (
    <div
      className="font-thebold"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: marginV,
        width: "100%",
        pointerEvents: "none",
        zIndex: 10,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'THE BOLD FONT (FREE VERSION)', 'THE BOLD FONT', 'Arial Black', sans-serif",
          fontSize: fontSize,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#ffffff",
          textAlign: "center",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.2em",
          lineHeight: 1.2,
        }}
      >
        {words.map((word: CaptionWord, i: number) => {
          const chunk = Math.floor(i / 3)
          const color = colorMap[chunk]
          const isActive = currentTime >= word.start && currentTime <= word.end

          // Double glow: White core + Colored aura + Hard Outline
          const glowShadow = isActive
            ? `
              /* Core White Glow */
              0 0 10px #fff,
              0 0 20px #fff,
              /* Colored Aura */
              0 0 30px ${color},
              0 0 40px ${color},
              0 0 50px ${color},
              0 0 60px ${color},
              0 0 70px ${color},
              /* Hard Outline */
              -2px -2px 0 #000,
              2px -2px 0 #000,
              -2px 2px 0 #000,
              2px 2px 0 #000
            `
            : `
              /* Inactive: Simple Outline */
              -1px -1px 0 #000,
              1px -1px 0 #000,
              -1px 1px 0 #000,
              1px 1px 0 #000
            `

          return (
            <span
              key={i}
              style={{
                textShadow: glowShadow,
                backgroundColor: isActive ? color : "transparent",
                padding: "0.08em 0.12em",
                borderRadius: "0.2em",
                transition: "all 0.15s cubic-bezier(0.4, 0.0, 0.2, 1)",
                transform: isActive ? "scale(1.2)" : "scale(1)",
                display: "inline-block",
                whiteSpace: "nowrap",
                fontFamily: "'THE BOLD FONT (FREE VERSION)', 'THE BOLD FONT', 'Arial Black', sans-serif", // Force it here too
              }}
            >
              {word.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}

interface SimpleCaptionOverlayProps {
  segments: CaptionSegment[]
  currentTime: number
}

export function SimpleCaptionOverlay({ segments, currentTime }: SimpleCaptionOverlayProps) {
  const active = segments.find((seg: CaptionSegment) => currentTime >= seg.start && currentTime <= seg.end)
  if (!active) return null
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 40,
        textAlign: "center",
        fontFamily: 'Inter, sans-serif',
        fontSize: 40,
        color: "#fff",
        textShadow: "0 0 2px #000, 0 0 6px #000",
        pointerEvents: "none",
        width: "100%",
        zIndex: 10,
      }}
    >
      {active.text}
    </div>
  )
}
