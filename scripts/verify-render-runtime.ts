/**
 * Verifies the render runtime this deploy will actually use, and fails the
 * deploy if it cannot serve renders.
 *
 *   npm run verify:render-runtime
 *
 * Executes the REAL selected binary — the same one `resolveFfmpegBin()`
 * returns at runtime — and checks the full contract:
 *   • the binary exists and runs, and reports its version
 *   • all 33 required filters are present (drawtext included)
 *   • libx264 and aac are present
 *   • four real smoke renders succeed and produce valid media
 *
 * This exists because P0-2 shipped a runtime that satisfied 32 of 33 filters
 * and broke 100% of exports on the missing one. Nothing in the pipeline
 * noticed until users did. Checking capability listings alone is not enough
 * either: smoke B renders through drawtext for real, because "the filter is
 * listed" and "the filter works" are different claims.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { ffmpegBin, ffmpegBinaryInfo, encodeArgs } from "../utils/ffmpeg-render";
import { resolveFontFile } from "../lib/editor/filtergraph";
import {
  probeRuntimeCapabilities,
  REQUIRED_FILTERS,
  REQUIRED_VIDEO_ENCODER,
  REQUIRED_AUDIO_ENCODER,
} from "../lib/render-runtime";

function run(bin: string, args: string[], timeoutMs = 60_000): Promise<{ code: number | null; stderr: string; spawnError: string | null }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: null, stderr: "", spawnError: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => { clearTimeout(timer); resolve({ code, stderr, spawnError: null }); });
    proc.on("error", (err) => { clearTimeout(timer); resolve({ code: null, stderr: "", spawnError: err.message }); });
  });
}

/** Confirm a produced file really is playable media, not just a non-zero blob. */
async function validate(file: string, expect: "video" | "audio"): Promise<boolean> {
  const r = await run(ffmpegBin, ["-hide_banner", "-i", file], 20_000);
  if (!/Duration:\s*\d/.test(r.stderr)) return false;
  return expect === "video"
    ? /Stream #\d+:\d+.*Video/.test(r.stderr)
    : /Stream #\d+:\d+.*Audio/.test(r.stderr);
}

const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

async function main() {
  let failures = 0;
  const fail = (msg: string) => { console.error(`FAIL  ${msg}`); failures++; };
  const pass = (msg: string) => console.log(`PASS  ${msg}`);

  const info = ffmpegBinaryInfo();
  console.log(`--- Render runtime verification ---`);
  console.log(`binary   : ${info.path}`);
  console.log(`bundled  : ${info.bundled}`);
  console.log(`platform : ${process.platform}/${process.arch}`);

  if (!info.bundled && info.path === "ffmpeg") {
    console.warn("WARN  resolved to bare 'ffmpeg' on PATH — acceptable in local development, never in production.");
  }

  // ── Capabilities ──
  const caps = await probeRuntimeCapabilities(ffmpegBin);
  if (caps.spawnError) {
    fail(`binary could not be executed: ${caps.spawnError}`);
    console.error("\nRENDER RUNTIME UNUSABLE — aborting.");
    process.exit(1);
  }
  console.log(`version  : ${caps.version}`);
  console.log(`filters  : ${caps.totalFilters} available`);

  if (caps.missingFilters.length === 0) pass(`all ${REQUIRED_FILTERS.length} required filters present`);
  else fail(`missing required filters: ${caps.missingFilters.join(", ")}`);

  if (!caps.missingEncoders.includes(REQUIRED_VIDEO_ENCODER)) pass(`video encoder ${REQUIRED_VIDEO_ENCODER}`);
  else fail(`missing video encoder ${REQUIRED_VIDEO_ENCODER}`);

  if (!caps.missingEncoders.includes(REQUIRED_AUDIO_ENCODER)) pass(`audio encoder ${REQUIRED_AUDIO_ENCODER}`);
  else fail(`missing audio encoder ${REQUIRED_AUDIO_ENCODER}`);

  // ── Smoke tests ──
  const tmp = os.tmpdir();
  const stamp = Date.now();
  const cleanup: string[] = [];

  const assPath = path.join(tmp, `verify-runtime-${stamp}.ass`);
  fs.writeFileSync(
    assPath,
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n" +
      "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Alignment\n" +
      "Style: Default,Poppins,32,&H00FFFFFF,2\n\n" +
      "[Events]\nFormat: Layer, Start, End, Style, Text\n" +
      "Dialogue: 0,0:00:00.00,0:00:02.00,Default,Clipiro Test\n",
    "utf8",
  );
  cleanup.push(assPath);

  const smokes: Array<{ name: string; out: string; args: string[]; expect: "video" | "audio" }> = [
    {
      // A — production encoder configuration at a real export resolution.
      name: "A basic encode (1080x1920, production encoder args)",
      out: path.join(tmp, `verify-A-${stamp}.mp4`),
      expect: "video",
      args: [],
    },
    {
      // B — the capability P0-2 turned on.
      name: "B drawtext",
      out: path.join(tmp, `verify-B-${stamp}.mp4`),
      expect: "video",
      args: [],
    },
    {
      name: "C aac audio",
      out: path.join(tmp, `verify-C-${stamp}.m4a`),
      expect: "audio",
      args: [],
    },
    {
      name: "D subtitles / libass",
      out: path.join(tmp, `verify-D-${stamp}.mp4`),
      expect: "video",
      args: [],
    },
  ];

  smokes[0].args = [
    "-y", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2",
    ...encodeArgs("cpu"), smokes[0].out,
  ];
  smokes[1].args = [
    "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2",
    "-vf", `drawtext=fontfile='${esc(resolveFontFile("Poppins"))}':text='Clipiro Test':fontsize=32:fontcolor=white,format=yuv420p`,
    "-c:v", REQUIRED_VIDEO_ENCODER, "-preset", "ultrafast", smokes[1].out,
  ];
  smokes[2].args = [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2",
    "-c:a", REQUIRED_AUDIO_ENCODER, "-b:a", "192k", smokes[2].out,
  ];
  smokes[3].args = [
    "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2",
    "-vf", `subtitles=filename='${esc(assPath)}':fontsdir='${esc(path.join(process.cwd(), "public/fonts"))}',format=yuv420p`,
    "-c:v", REQUIRED_VIDEO_ENCODER, "-preset", "ultrafast", smokes[3].out,
  ];

  for (const s of smokes) {
    cleanup.push(s.out);
    const r = await run(ffmpegBin, s.args);
    if (r.spawnError) { fail(`${s.name} — spawn error: ${r.spawnError}`); continue; }
    if (r.code !== 0) {
      const why = (r.stderr.match(/No such filter[^\n]*|Unknown encoder[^\n]*|Error[^\n]*/g) ?? []).slice(0, 3).join(" | ");
      fail(`${s.name} — exit ${r.code}${why ? ` — ${why}` : ""}`);
      continue;
    }
    let bytes = 0;
    try { bytes = fs.statSync(s.out).size; } catch { /* stays 0 */ }
    if (bytes <= 0) { fail(`${s.name} — no output produced`); continue; }
    if (!(await validate(s.out, s.expect))) { fail(`${s.name} — output is not valid ${s.expect} media`); continue; }
    pass(`${s.name} (${bytes} bytes, valid)`);
  }

  for (const f of cleanup) { try { fs.unlinkSync(f); } catch { /* best effort */ } }

  if (failures > 0) {
    console.error(`\nRENDER RUNTIME VERIFICATION FAILED — ${failures} check(s) failed.`);
    console.error("Refusing to certify this deploy: exports would fail in production.");
    process.exit(1);
  }
  console.log("\nRENDER RUNTIME OK — all capability checks and smoke tests passed.");
}

main().catch((err) => {
  console.error("render runtime verification crashed:", err);
  process.exit(1);
});
