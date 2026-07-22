/**
 * Smoke test: confirms the bundled ffmpeg-static supports every effect filter
 * and xfade transition name emitted by lib/editor/filtergraph.ts (rgbashift,
 * zoompan, vignette, noise, xfade transition names, tpad, settb). Uses tiny
 * synthetic lavfi sources so it runs in seconds with no assets. Run with:
 *   npx tsx utils/test-effects.ts
 */
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { EFFECT_PRESETS, TRANSITION_PRESETS, TRANSITION_DURATION_SEC } from "../lib/editor/types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require("ffmpeg-static") as string;

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

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
