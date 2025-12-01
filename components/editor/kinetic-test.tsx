/**
 * Test component to verify THEBOLDFONT-FREEVERSION font and glow effects
 * This is a standalone test to confirm the overlay styling works correctly
 */

export function KineticFontTest() {
  return (
    <div
      style={{
        backgroundColor: "#000",
        padding: "40px",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h3 style={{ color: "#fff", marginTop: 0 }}>Font & Glow Test</h3>

      {/* Test 1: Font only */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "#999", fontSize: "12px", margin: "0 0 8px 0" }}>
          Test 1: THEBOLDFONT-FREEVERSION (no glow)
        </p>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', 'Arial Black', sans-serif",
            fontSize: "48px",
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          CREATOR KINETIC
        </div>
      </div>

      {/* Test 2: Font with subtle glow */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "#999", fontSize: "12px", margin: "0 0 8px 0" }}>
          Test 2: Font with subtle glow
        </p>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', 'Arial Black', sans-serif",
            fontSize: "48px",
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            textShadow: `
              0 0 2px #000,
              0 0 4px #000,
              0 0 8px #70e2ff,
              0 0 12px #70e2ff,
              0 0 16px #70e2ff
            `,
          }}
        >
          CREATOR KINETIC
        </div>
      </div>

      {/* Test 3: Font with strong glow */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "#999", fontSize: "12px", margin: "0 0 8px 0" }}>
          Test 3: Font with STRONG glow
        </p>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', 'Arial Black', sans-serif",
            fontSize: "48px",
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            textShadow: `
              0 0 4px #70e2ff,
              0 0 8px #70e2ff,
              0 0 12px #70e2ff,
              0 0 16px #70e2ff,
              0 0 20px #70e2ff,
              0 0 24px #70e2ff,
              0 0 28px #70e2ff,
              0 0 32px #70e2ff,
              0 0 36px #70e2ff,
              0 0 40px #ffffff,
              0 0 48px #ffffff,
              0 0 56px #ffffff,
              -2px -2px 4px #000,
              2px -2px 4px #000,
              -2px 2px 4px #000,
              2px 2px 4px #000,
              0 0 2px #000,
              0 0 4px #000
            `,
          }}
        >
          CREATOR KINETIC
        </div>
      </div>

      {/* Test 4: Animated word with color background */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "#999", fontSize: "12px", margin: "0 0 8px 0" }}>
          Test 4: Animated word (KINETIC highlighted)
        </p>
        <div
          style={{
            fontFamily: "'THEBOLDFONT-FREEVERSION', 'Arial Black', sans-serif",
            fontSize: "48px",
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            display: "flex",
            gap: "0.2em",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ textShadow: "0 0 2px #000, 0 0 4px #000" }}>CREATOR</span>
          <span
            style={{
              backgroundColor: "#70e2ff",
              padding: "0.08em 0.12em",
              borderRadius: "0.2em",
              textShadow: `
                0 0 4px #70e2ff,
                0 0 8px #70e2ff,
                0 0 12px #70e2ff,
                0 0 16px #70e2ff,
                0 0 20px #70e2ff,
                0 0 24px #70e2ff,
                0 0 28px #70e2ff,
                0 0 32px #70e2ff,
                0 0 36px #70e2ff,
                0 0 40px #ffffff,
                0 0 48px #ffffff,
                0 0 56px #ffffff,
                -2px -2px 4px #000,
                2px -2px 4px #000,
                -2px 2px 4px #000,
                2px 2px 4px #000,
                0 0 2px #000,
                0 0 4px #000
              `,
              transform: "scale(1.2)",
            }}
          >
            KINETIC
          </span>
        </div>
      </div>
    </div>
  )
}
