import React from "react"

export function KineticCaptionOverlay({ segments, currentTime }) {
  // Find the active segment
  const active = segments.find(seg => currentTime >= seg.start && currentTime <= seg.end)
  if (!active || !active.words || !active.words.length) return null

  // Creator Kinetics template details
  const fontFamily = 'Retro Dreami Display Free Demo, sans-serif'
  const fontSize = 58
  const outlineColor = '#000'
  const outlineWidth = 2
  const marginV = 50
  const highlightColors = ["#70e2ff", "#ffe83f", "#9fff5b"]
  const cycleAfterChunks = 2

  // Word highlighting logic
  const words = active.words
  // Find which word is currently being spoken
  const activeWordIdx = words.findIndex(w => currentTime >= w.start && currentTime <= w.end)
  // Color cycling logic
  let chunkIdx = 0
  let colorIdx = 0
  let colorMap = []
  for (let i = 0; i < words.length; i += 3) {
    colorMap.push(highlightColors[colorIdx])
    chunkIdx++
    if (chunkIdx % cycleAfterChunks === 0) colorIdx = (colorIdx + 1) % highlightColors.length
  }

  // Render words with highlight
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: marginV,
        textAlign: "center",
        fontFamily,
        fontSize,
        color: "#fff",
        textTransform: "uppercase",
        textShadow: `0 0 2px ${outlineColor}, 0 0 6px ${outlineColor}`,
        WebkitTextStroke: `${outlineWidth}px ${outlineColor}`,
        pointerEvents: "none",
        width: "100%",
        zIndex: 10,
      }}
    >
      {words.map((word, i) => {
        // Which chunk is this word in?
        const chunk = Math.floor(i / 3)
        const color = colorMap[chunk]
        const isActive = currentTime >= word.start && currentTime <= word.end
        return (
          <span
            key={i}
            style={{
              margin: "0 0.18em",
              padding: "0 0.08em",
              background: isActive ? color : "transparent",
              borderRadius: "0.2em",
              transition: "background 0.2s",
              boxShadow: isActive ? `0 0 12px ${color}` : undefined,
            }}
          >
            {word.text}
          </span>
        )
      })}
    </div>
  )
}

export function SimpleCaptionOverlay({ segments, currentTime }) {
  const active = segments.find(seg => currentTime >= seg.start && currentTime <= seg.end)
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
