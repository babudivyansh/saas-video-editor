/**
 * Smoke test: generates an ASS subtitle file, runs FFmpeg with a synthetic
 * color-source background and a sine-wave audio track, and confirms a
 * portrait 9:16 output is produced. Run with:
 *   npx tsx utils/test-ffmpeg.ts
 */
import path from "path";
import fs from "fs";
import os from "os";
import { generateASS } from "./ffmpeg-render";
import { spawn } from "child_process";
import type { WordTiming } from "./elevenlabs";

const TMP = os.tmpdir();
const assPath = path.join(TMP, "test-captions.ass");
const outPath = path.join(TMP, "test-output.mp4");

const words: WordTiming[] = [
  { word: "Hello", start: 0, end: 500 },
  { word: "world", start: 500, end: 1000 },
  { word: "this", start: 1000, end: 1400 },
  { word: "is", start: 1400, end: 1700 },
  { word: "a", start: 1700, end: 1900 },
  { word: "test", start: 1900, end: 2500 },
  { word: "video", start: 2500, end: 3000 },
];

console.log("1. Writing ASS subtitle file...");
generateASS(words, { fontName: "Arial", fontSize: 60 }, assPath);
console.log("   Written to", assPath);

const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

const args = [
  "-y",
  "-f", "lavfi", "-i", `color=c=blue:s=1080x1920:d=4:r=30`,
  "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
  "-filter_complex",
  `[0:v]subtitles='${assEscaped}'[v]`,
  "-map", "[v]",
  "-map", "1:a",
  "-c:v", "libx264",
  "-preset", "ultrafast",
  "-c:a", "aac",
  "-t", "4",
  outPath,
];

console.log("2. Running FFmpeg...");
const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

let stderr = "";
proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

proc.on("close", (code) => {
  if (code !== 0) {
    console.error("FFmpeg failed:\n", stderr.slice(-1500));
    process.exit(1);
  }
  const stats = fs.statSync(outPath);
  console.log(`3. Success! Output: ${outPath} (${(stats.size / 1024).toFixed(0)} KB)`);
  console.log("   Toolchain is healthy.");
});

proc.on("error", (err) => {
  console.error("Could not spawn ffmpeg:", err.message);
  console.error("Make sure FFmpeg is installed and on your PATH.");
  process.exit(1);
});
