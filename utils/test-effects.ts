/**
 * Smoke test: confirms the bundled ffmpeg-static supports every effect filter
 * and xfade transition name emitted by lib/editor/filtergraph.ts (rgbashift,
 * zoompan, vignette, noise, xfade transition names, tpad, settb). Uses tiny
 * synthetic lavfi sources so it runs in seconds with no assets. Run with:
 *   npx tsx utils/test-effects.ts
 *
 * Also covers the two *text* filters, added after the P0-2 production export
 * outage: production ran an ffmpeg 7.0.2 build compiled without libharfbuzz,
 * which FFmpeg 7.0 made a hard dependency of `drawtext`, so drawtext was
 * silently absent and EVERY export died at -filter_complex parse time. This
 * script already existed and would have caught it — except it only covered
 * effects and transitions, never drawtext. See
 * docs/editor-release-gate-stage1-production-verification.md.
 *
 * NOTE: this validates whichever binary is *actually installed where it
 * runs*. Running it in CI or locally does not prove production is healthy —
 * that was precisely the gap. Run it against the production host's binary.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { EFFECT_PRESETS, TRANSITION_PRESETS, TRANSITION_DURATION_SEC } from "../lib/editor/types";
import { resolveFontFile } from "../lib/editor/filtergraph";

// The application's resolved binary, not ffmpeg-static directly: on Linux
// that package's build is the drawtext-less one P0-2 replaced, so probing it
// would report a failure for a binary production no longer uses.
import { ffmpegBin as ffmpeg } from "./ffmpeg-render";

const W = 270, H = 480; // small = fast; same 9:16 shape as a real portrait export
const out = (n: string) => path.join(os.tmpdir(), `fx-smoke-${n}.mp4`);

function run(name: string, filterComplex: string, inputs: string[]): boolean {
  const args = ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[v]", "-t", "2", out(name)];
  const r = spawnSync(ffmpeg, args, { encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(r.stderr?.split("\n").slice(-8).join("\n"));
  return ok;
}

const src = (c: string, d: number) => ["-f", "lavfi", "-i", `color=c=${c}:s=${W}x${H}:d=${d}:r=30`];
let failures = 0;

for (const [key, def] of Object.entries(EFFECT_PRESETS)) {
  if (!def.ffmpeg) continue;
  if (!run(`effect-${key}`, `[0:v]${def.ffmpeg(W, H)},format=yuv420p[v]`, src("blue", 2))) failures++;
}

for (const [key, def] of Object.entries(TRANSITION_PRESETS)) {
  if (!def.xfade) continue;
  const fc =
    `[0:v]format=yuv420p,settb=AVTB,tpad=stop_mode=clone:stop_duration=${TRANSITION_DURATION_SEC}[a];` +
    `[1:v]format=yuv420p,settb=AVTB[b];` +
    `[a][b]xfade=transition=${def.xfade}:duration=${TRANSITION_DURATION_SEC}:offset=1[v]`;
  if (!run(`transition-${key}`, fc, [...src("blue", 1), ...src("red", 1)])) failures++;
}

// ── Text filters (P0-2 regression guard) ──
// drawtext is emitted once per text clip AND unconditionally for the
// free-tier watermark, so if it is missing every single export fails.
{
  const font = resolveFontFile("Poppins").replace(/\\/g, "/").replace(/:/g, "\\:");
  const fc = `[0:v]drawtext=fontfile='${font}':text='Clipiro':fontsize=24:fontcolor=white,format=yuv420p[v]`;
  if (!run("text-drawtext", fc, src("blue", 2))) failures++;
}

// subtitles (libass) burns in the caption track. Not implicated in the P0-2
// outage — it was present in both builds — but it is the other text path the
// editor depends on, and a binary missing it would break every captioned
// export the same way.
{
  const assPath = path.join(os.tmpdir(), "fx-smoke-captions.ass");
  fs.writeFileSync(
    assPath,
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 270\nPlayResY: 480\n\n" +
      "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Alignment\n" +
      "Style: Default,Poppins,24,&H00FFFFFF,2\n\n" +
      "[Events]\nFormat: Layer, Start, End, Style, Text\n" +
      "Dialogue: 0,0:00:00.00,0:00:02.00,Default,Clipiro\n",
    "utf8",
  );
  const fontsDir = path.join(process.cwd(), "public/fonts").replace(/\\/g, "/").replace(/:/g, "\\:");
  const esc = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const fc = `[0:v]subtitles=filename='${esc}':fontsdir='${fontsDir}',format=yuv420p[v]`;
  if (!run("text-subtitles", fc, src("blue", 2))) failures++;
  try { fs.unlinkSync(assPath); } catch { /* best effort */ }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
