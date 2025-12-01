import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const FONT_SOURCE = "d:\\VSCode Projects\\UIUXMAIN\\AutoCapsAI\\public\\fonts\\THEBOLDFONT-FREEVERSION.ttf";
const TEMP_DIR = tmpdir();

async function run() {
  console.log("Starting reproduction script...");

  // 1. Setup paths
  const runId = Date.now();
  const videoPath = join(TEMP_DIR, `repro_${runId}.mp4`);
  const assPath = join(TEMP_DIR, `repro_${runId}.ass`);
  const outPath = join(TEMP_DIR, `repro_out_${runId}.mp4`);
  
  // Create a dedicated clean directory for fonts to prevent FFmpeg from scanning garbage
  const fontsDir = join(TEMP_DIR, `fonts_${runId}`);
  await fs.mkdir(fontsDir, { recursive: true });
  // Rename the font file to a simple name
  const fontDest = join(fontsDir, "CustomFont.ttf");

  // 2. Copy font
  console.log(`Copying font to ${fontDest}...`);
  await fs.copyFile(FONT_SOURCE, fontDest);

  // 3. Create dummy video (2 seconds black)
  console.log("Creating dummy video...");
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black:s=1280x720:d=2",
      "-c:v", "libx264",
      videoPath
    ];
    const p = spawn(FFMPEG_PATH, args);
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Failed to create video: ${code}`)));
  });

  // 4. Create dummy ASS file
  console.log("Creating ASS file...");
  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,THE BOLD FONT (FREE VERSION),60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Testing Font Loading
`;
  await fs.writeFile(assPath, assContent);

  // 5. Run FFmpeg with subtitles filter
  console.log("Running FFmpeg render...");
  
  // Escape paths for filter
  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/ /g, "\\ ");
  const escAss = esc(assPath);
  const escFonts = esc(fontsDir);

  const filter = `subtitles='${escAss}:fontsdir=${escFonts}'`;
  console.log(`Filter: ${filter}`);

  const args = [
    "-y",
    "-i", videoPath,
    "-vf", filter,
    "-c:v", "libx264",
    "-c:a", "copy", // No audio in dummy
    outPath
  ];

  const p = spawn(FFMPEG_PATH, args);
  
  p.stderr.on("data", (d) => {
    const s = d.toString();
    // Log only relevant font stuff or errors
    if (s.includes("Error") || s.includes("font") || s.includes("Parsed_subtitles")) {
      console.log(`[FFmpeg] ${s.trim()}`);
    }
  });

  p.on("close", (code) => {
    console.log(`FFmpeg exited with code ${code}`);
    if (code === 0) {
      console.log("SUCCESS! Check output at:", outPath);
    } else {
      console.log("FAILED.");
    }
  });
}

run().catch(console.error);
