import { spawnSync } from "node:child_process";

export function getVideoDuration(videoPath: string): number | null {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  if (result.status !== 0) return null;
  const output = result.stdout.toString().trim();
  const duration = parseFloat(output);
  return isNaN(duration) ? null : duration;
}
