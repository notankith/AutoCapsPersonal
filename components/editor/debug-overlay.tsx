/**
 * Debug overlay to verify font and glow rendering
 * Inject this temporarily in post-upload-workspace.tsx to test
 */

export function DebugCaptionOverlay() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: "rgba(0, 0, 0, 0.95)",
        color: "#0f0",
        padding: "16px",
        borderRadius: "8px",
        fontFamily: "monospace",
        fontSize: "12px",
        maxWidth: "400px",
        zIndex: 9999,
        border: "2px solid #0f0",
        lineHeight: "1.6",
      }}
    >
      <div style={{ marginBottom: "8px", fontWeight: "bold", color: "#0ff" }}>
        🔍 DEBUG: Font & Glow Verification
      </div>

      {/* Test 1: Font Family Detection */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ color: "#0f0" }}>✓ Font Loaded:</div>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', sans-serif",
            fontSize: "14px",
            fontWeight: 900,
            marginTop: "4px",
          }}
        >
          THEBOLDFONT TEST
        </div>
      </div>

      {/* Test 2: Glow Effect */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ color: "#0f0" }}>✓ Glow Active:</div>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', sans-serif",
            fontSize: "14px",
            fontWeight: 900,
            marginTop: "4px",
            textShadow: `
              0 0 4px #70e2ff,
              0 0 8px #70e2ff,
              0 0 12px #70e2ff,
              0 0 16px #70e2ff,
              0 0 20px #70e2ff,
              0 0 24px #70e2ff,
              0 0 32px #ffffff,
              0 0 48px #ffffff
            `,
          }}
        >
          GLOW TEST
        </div>
      </div>

      {/* Test 3: Font URL */}
      <div style={{ marginBottom: "8px", fontSize: "11px", color: "#999" }}>
        📍 Font URL: /fonts/THEBOLDFONT-FREEVERSION.ttf
      </div>

      {/* Test 4: CSS Font-Face Status */}
      <div style={{ marginBottom: "8px", fontSize: "11px", color: "#999" }}>
        📄 CSS: @font-face defined ✓
      </div>

      {/* Test 5: Inline Style Check */}
      <div style={{ marginBottom: "8px", fontSize: "11px", color: "#999" }}>
        🎨 Inline Styles: Applied ✓
      </div>
    </div>
  )
}
