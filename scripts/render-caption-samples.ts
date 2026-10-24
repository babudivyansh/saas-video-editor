#!/usr/bin/env tsx
// Renders every caption template (or the ids given) onto a busy test pattern
// with the real ffmpeg and the real engine, saves one frame per template and a
// contact sheet. For eyeballing changes to the engine or the templates:
//
//   npx tsx scripts/render-caption-samples.ts [outDir] [templateId ...]
//
// Default outDir: .caption-samples/ (gitignored).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CAPTION_TEMPLATES, parseCaptionSample, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { buildCaptionTrack, buildCaptionFilterChain } from "@/lib/captions/engine";
import { ffmpegBin } from "@/utils/ffmpeg-render";

const W = 1080;
const H = 1920;
const WORD_MS = 360;

const [outArg, ...ids] = process.argv.slice(2);
const outDir = path.resolve(outArg && !CAPTION_TEMPLATES.some((t) => t.id === outArg) ? outArg : ".caption-samples");
if (outArg && CAPTION_TEMPLATES.some((t) => t.id === outArg)) ids.unshift(outArg);
const templates = ids.length ? CAPTION_TEMPLATES.filter((t) => ids.includes(t.id)) : CAPTION_TEMPLATES;
fs.mkdirSync(outDir, { recursive: true });

export function sampleWords(t: CaptionTemplateSpec) {
  const tokens = parseCaptionSample(t.sample);
  const words = tokens.map((tok, i) => ({
    word: tok.text,
    start: 200 + i * WORD_MS,
    end: 200 + i * WORD_MS + WORD_MS - 30,
    // Two Mic: alternate speakers every four words.
    speaker: t.extra === "speakers" ? `speaker_${Math.floor(i / 4) % 2}` : undefined,
  }));
  const emoji: Record<number, string> = {};
  const emphasis: number[] = [];
  tokens.forEach((tok, i) => {
    if (tok.emoji) emoji[i] = tok.emoji;
    if (tok.emphasis) emphasis.push(i);
  });
  return { words, emoji, emphasis };
}

let failures = 0;
templates.forEach((t) => {
  const n = CAPTION_TEMPLATES.indexOf(t);
  const { words, emoji, emphasis } = sampleWords(t);
  const rms = { hz: 20, values: Array.from({ length: 200 }, (_, i) => 0.5 + 0.5 * Math.sin(i / 2)) };
  const track = buildCaptionTrack({ words, template: t, W, H, durationMs: 6000, emoji, emphasis, rms });
  const assPath = path.join(outDir, `${t.id}.ass`);
  fs.writeFileSync(assPath, track.ass);
  const chain = buildCaptionFilterChain({ track, assPath, inLabel: "bg", outLabel: "out" });
  // Show the frame a quarter-way into the second word of the first chunk that has one.
  const first = track.layout.chunks[0]?.words[Math.min(1, (track.layout.chunks[0]?.words.length ?? 1) - 1)];
  const at = ((first?.activeStart ?? 300) + 240) / 1000;
  const png = path.join(outDir, `${String(n).padStart(3, "0")}-${t.id}.png`);
  const graph = `[0:v]format=yuv420p,eq=brightness=-0.12:saturation=0.8[bg];${chain}`;
  const r = spawnSync(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=${W}x${H}:d=6:r=30`,
    "-filter_complex", graph, "-map", "[out]",
    "-ss", at.toFixed(2), "-frames:v", "1", png,
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    failures++;
    process.stderr.write(`✗ ${t.id}: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}\n`);
  } else {
    process.stdout.write(`✓ ${t.id}\n`);
  }
});

if (templates.length > 1 && !failures) {
  const sheet = path.join(outDir, "contact-sheet.png");
  const pngs = fs.readdirSync(outDir).filter((f) => /^\d{3}-.*\.png$/.test(f)).sort();
  const cols = 10;
  const rows = Math.ceil(pngs.length / cols);
  const inputs = pngs.flatMap((f) => ["-i", path.join(outDir, f)]);
  const scaled = pngs.map((_, i) => `[${i}:v]scale=216:384[s${i}]`).join(";");
  const stack = `${pngs.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${pngs.length}:layout=${pngs
    .map((_, i) => `${(i % cols) * 216}_${Math.floor(i / cols) * 384}`)
    .join("|")}:fill=black[o]`;
  const r = spawnSync(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", `${scaled};${stack}`, "-map", "[o]", "-frames:v", "1", sheet], { encoding: "utf8" });
  process.stdout.write(r.status === 0 ? `contact sheet: ${sheet} (${cols}x${rows})\n` : `contact sheet failed: ${r.stderr}\n`);
}
process.exitCode = failures ? 1 : 0;
