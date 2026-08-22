// SEV-1 P0-2 runtime capability probe. Admin-only (withAdmin requires role +
// a recent OTP step-up — this reveals server filesystem paths and binary
// versions, not something a bare dashboard session should be able to probe).
//
// Purpose, single and narrow: answer whether the production Linux host
// already provides a viable system ffmpeg with every capability Clipiro
// requires — so the P0-2 remediation is chosen from evidence rather than
// assumption.
//
// Confirmed context this exists to resolve: the bundled binary
// (ffmpeg-static@5.3.0, release tag `b6.1.1` — which names the ffmpeg-static
// release, NOT the ffmpeg version) ships a johnvansickle 7.0.2 linux build
// with no `drawtext` filter. Verified byte-identical to what production runs.
// Clipiro always reaches drawtext (user text overlays AND the free-tier
// watermark), so every applicable export fails at -filter_complex parse time.
//
// REPORT-ONLY. This route changes no runtime behaviour and does not alter
// binary selection — deliberately, so a diagnostic deploy cannot become an
// unreviewed runtime migration.
//
// Every value returned is a path, version string, boolean, byte count, or
// ffmpeg's own output for synthetic (lavfi) input. Never a user's media, a
// signed URL, a token, a cookie, or an environment variable value.

import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { logger } from "@/lib/logger";
import { ffmpegBin, ffmpegBinaryInfo, encodeArgs } from "@/utils/ffmpeg-render";
import { resolveFontFile } from "@/lib/editor/filtergraph";

export function run(bin: string, args: string[], timeoutMs = 15_000): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; spawnError: string | null }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: null, signal: null, stdout: "", stderr: "", spawnError: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => { proc.kill("SIGKILL"); }, timeoutMs);
    const finish = (result: { code: number | null; signal: NodeJS.Signals | null; spawnError: string | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Full, untruncated output — a caller searching a long listing (e.g.
      // `-encoders`) for a substring needs the whole thing, not just the
      // tail. Truncate only at the point of building the HTTP response, not
      // here (a prior version of this truncated to the last 4000 chars here,
      // which silently cut libx264/aac out of the `-encoders` listing and
      // would have reported a false "encoder missing" — caught locally
      // before this ever reached production).
      resolve({ ...result, stdout, stderr });
    };
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code, signal) => finish({ code, signal, spawnError: null }));
    proc.on("error", (err) => finish({ code: null, signal: null, spawnError: err.message }));
  });
}

/**
 * Parse `ffmpeg -filters` output into filter names.
 *
 * Format is ` TSC  name  IN->OUT  description`. Anchoring on the flag column
 * alone isn't enough — the legend lines ("T.. = Timeline support") match it
 * too and yield a filter literally named "=", so require a real identifier
 * and the in->out signature as well.
 */
export function parseFilterNames(stdout: string): string[] {
  return [...stdout.matchAll(/^\s*[TSC.]{3}\s+([a-zA-Z][\w]*)\s+\S+->\S+/gm)].map((m) => m[1]);
}

// Every filter lib/editor/filtergraph.ts and lib/editor/types.ts's
// FILTER_PRESETS / EFFECT_PRESETS / TRANSITION_PRESETS can emit.
const REQUIRED_FILTERS = [
  "adelay", "afade", "aformat", "amix", "anullsrc", "asetpts", "atempo", "atrim",
  "color", "colorbalance", "colorchannelmixer", "concat", "crop", "drawtext",
  "eq", "fade", "format", "fps", "hue", "noise", "overlay", "rgbashift",
  "scale", "setpts", "setsar", "settb", "subtitles", "tpad", "trim",
  "vignette", "volume", "xfade", "zoompan",
];

// Traced from the actual production render commands, not assumed:
// lib/editor/filtergraph.ts (editor) and utils/ffmpeg-render.ts's
// encodeArgs("cpu") (AutoClip) both request libx264 + aac. h264_nvenc is the
// gpu path, unused in production per lib/render-target.ts.
const REQUIRED_VIDEO_ENCODER = "libx264";
const REQUIRED_AUDIO_ENCODER = "aac";

const SYSTEM_CANDIDATES = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/ffmpeg/bin/ffmpeg", "/snap/bin/ffmpeg", "ffmpeg"];

interface BinaryProbe {
  path: string;
  usable: boolean;
  reason?: string;
  file?: { existsOnDisk: boolean; executable: boolean; sizeBytes: number | null; permissionsOctal: string | null };
  versionFirstLine?: string | null;
  totalFilters?: number;
  filters?: Record<string, boolean>;
  missingFilters?: string[];
  encoders?: Record<string, boolean>;
  buildFlags?: { count: number; freetype: boolean; harfbuzz: boolean; libass: boolean; fontconfig: boolean };
}

function fileIdentity(bin: string): BinaryProbe["file"] {
  // Bare "ffmpeg" resolves via PATH — nothing to stat.
  if (!path.isAbsolute(bin)) return { existsOnDisk: false, executable: false, sizeBytes: null, permissionsOctal: null };
  let executable = false;
  try { fs.accessSync(bin, fs.constants.X_OK); executable = true; } catch { /* reported false */ }
  try {
    const st = fs.statSync(bin);
    return { existsOnDisk: true, executable, sizeBytes: st.size, permissionsOctal: (st.mode & 0o777).toString(8) };
  } catch {
    return { existsOnDisk: false, executable, sizeBytes: null, permissionsOctal: null };
  }
}

/**
 * Full capability probe of one ffmpeg binary. Used identically for the
 * bundled binary and every system candidate so the two are directly
 * comparable rather than measured different ways.
 *
 * Filter availability comes from `-filters` (authoritative); build flags are
 * collected as supporting evidence only — a build can enable libfreetype and
 * still lack drawtext, which is exactly the P0-2 situation.
 */
export async function probeBinary(bin: string): Promise<BinaryProbe> {
  const file = fileIdentity(bin);
  const version = await run(bin, ["-version"], 10_000);
  if (version.spawnError || version.code !== 0) {
    return { path: bin, usable: false, reason: version.spawnError ?? `exit ${version.code}`, file };
  }
  const filtersOut = await run(bin, ["-hide_banner", "-filters"], 15_000);
  const names = new Set(parseFilterNames(filtersOut.stdout));
  const encodersOut = await run(bin, ["-hide_banner", "-encoders"], 15_000);
  const hasEncoder = (n: string) => new RegExp(`\\b${n}\\b`).test(encodersOut.stdout);
  const flags = [...version.stdout.matchAll(/--(?:enable|disable)-[\w-]+/g)].map((m) => m[0]);
  const enabled = (needle: RegExp) => flags.some((f) => needle.test(f) && f.startsWith("--enable"));

  return {
    path: bin,
    usable: true,
    file,
    versionFirstLine: version.stdout.split("\n")[0] ?? null,
    totalFilters: names.size,
    filters: Object.fromEntries(REQUIRED_FILTERS.map((f) => [f, names.has(f)])),
    missingFilters: REQUIRED_FILTERS.filter((f) => !names.has(f)),
    encoders: {
      [REQUIRED_VIDEO_ENCODER]: hasEncoder(REQUIRED_VIDEO_ENCODER),
      [REQUIRED_AUDIO_ENCODER]: hasEncoder(REQUIRED_AUDIO_ENCODER),
      h264_nvenc: hasEncoder("h264_nvenc"),
    },
    buildFlags: {
      count: flags.length,
      freetype: enabled(/freetype/),
      harfbuzz: enabled(/harfbuzz/),
      libass: enabled(/libass/),
      fontconfig: enabled(/fontconfig/),
    },
  };
}

/** A binary is only viable if it can fully replace the bundled runtime. */
function isViable(p: BinaryProbe): boolean {
  return p.usable === true
    && (p.missingFilters?.length ?? 1) === 0
    && p.encoders?.[REQUIRED_VIDEO_ENCODER] === true
    && p.encoders?.[REQUIRED_AUDIO_ENCODER] === true;
}

/**
 * Validate a produced file really is playable media. Prefers a sibling
 * ffprobe (this project bundles no ffprobe package — ffmpeg-static ships
 * ffmpeg only — but a system ffmpeg almost always has one alongside);
 * otherwise falls back to parsing `ffmpeg -i`. The method used is reported so
 * a weaker check is never mistaken for a stronger one.
 */
async function validateMedia(bin: string, file: string): Promise<{ method: string; ok: boolean; detail: string }> {
  const sibling = path.isAbsolute(bin) ? path.join(path.dirname(bin), "ffprobe") : "ffprobe";
  const probe = await run(sibling, ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type", "-of", "default=noprint_wrappers=1", file], 10_000);
  if (!probe.spawnError && probe.code === 0) {
    return {
      method: `ffprobe (${sibling})`,
      ok: /duration=[\d.]+/.test(probe.stdout) && /codec_type=video/.test(probe.stdout),
      detail: probe.stdout.trim().slice(0, 400),
    };
  }
  const viaFfmpeg = await run(bin, ["-hide_banner", "-i", file], 10_000);
  return {
    method: "ffmpeg -i (no ffprobe available)",
    ok: /Stream #\d+:\d+.*Video/.test(viaFfmpeg.stderr) && /Duration:\s*\d/.test(viaFfmpeg.stderr),
    detail: (viaFfmpeg.stderr.match(/Duration:[^\n]*|Stream #[^\n]*/g) ?? []).join(" | ").slice(0, 400),
  };
}

interface SmokeResult {
  name: string;
  exitCode: number | null;
  spawnError: string | null;
  outputExists: boolean;
  outputBytes: number;
  validation: { method: string; ok: boolean; detail: string } | null;
  passed: boolean;
  stderrTail?: string;
}

/**
 * Direct smoke tests against one specific binary, using Clipiro's real
 * encoder request. Synthetic lavfi sources only — no user media touched.
 * Each output must exist, be non-empty, exit 0, and validate as real media.
 */
export async function smokeTests(bin: string, tmp: string): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const stamp = Date.now();

  // Filter-arg escaping: on Linux these paths contain neither backslashes nor
  // colons, but normalise defensively so a Windows-hosted run is not silently
  // malformed.
  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

  const cases: Array<{ name: string; args: (out: string) => string[] }> = [
    {
      // A. Basic encoding with Clipiro's actual production encoder request.
      name: "A_basic_encode",
      args: (out) => [
        "-y", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440",
        "-t", "2", ...encodeArgs("cpu"), out,
      ],
    },
    {
      // B. drawtext — the exact capability P0-2 turns on.
      name: "B_drawtext",
      args: (out) => [
        "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2",
        "-vf", `drawtext=fontfile='${esc(resolveFontFile("Poppins"))}':text='Clipiro Test':fontsize=32:fontcolor=white,format=yuv420p`,
        "-c:v", REQUIRED_VIDEO_ENCODER, "-preset", "ultrafast", out,
      ],
    },
    {
      // C. Audio with Clipiro's actual audio encoder.
      name: "C_audio_aac",
      args: (out) => [
        "-y", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2",
        "-c:a", REQUIRED_AUDIO_ENCODER, "-b:a", "192k", out,
      ],
    },
    {
      // D. ASS/libass caption burn-in — the editor's other text path.
      name: "D_subtitles_libass",
      args: (out) => [
        "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "2",
        "-vf", `subtitles=filename='${esc(path.join(tmp, `render-diag-${stamp}.ass`))}':fontsdir='${esc(path.join(process.cwd(), "public/fonts"))}',format=yuv420p`,
        "-c:v", REQUIRED_VIDEO_ENCODER, "-preset", "ultrafast", out,
      ],
    },
  ];

  const assPath = path.join(tmp, `render-diag-${stamp}.ass`);
  fs.writeFileSync(
    assPath,
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n" +
      "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Alignment\n" +
      "Style: Default,Poppins,32,&H00FFFFFF,2\n\n" +
      "[Events]\nFormat: Layer, Start, End, Style, Text\n" +
      "Dialogue: 0,0:00:00.00,0:00:02.00,Default,Clipiro Test\n",
    "utf8",
  );

  for (const c of cases) {
    const ext = c.name === "C_audio_aac" ? "m4a" : "mp4";
    const out = path.join(tmp, `render-diag-smoke-${c.name}-${stamp}.${ext}`);
    const r = await run(bin, c.args(out), 40_000);
    let outputExists = false;
    let outputBytes = 0;
    try { const st = fs.statSync(out); outputExists = true; outputBytes = st.size; } catch { /* stays false */ }

    // Audio-only output has no video stream, so validate it by codec presence
    // rather than through the video-oriented validator.
    let validation: SmokeResult["validation"] = null;
    if (outputExists && outputBytes > 0) {
      if (c.name === "C_audio_aac") {
        const check = await run(bin, ["-hide_banner", "-i", out], 10_000);
        validation = {
          method: "ffmpeg -i (audio stream check)",
          ok: /Stream #\d+:\d+.*Audio.*aac/i.test(check.stderr),
          detail: (check.stderr.match(/Stream #[^\n]*/g) ?? []).join(" | ").slice(0, 400),
        };
      } else {
        validation = await validateMedia(bin, out);
      }
    }
    const passed = r.spawnError === null && r.code === 0 && outputExists && outputBytes > 0 && validation?.ok === true;
    results.push({
      name: c.name,
      exitCode: r.code,
      spawnError: r.spawnError,
      outputExists,
      outputBytes,
      validation,
      passed,
      ...(passed ? {} : { stderrTail: r.stderr.slice(-1200) }),
    });
    try { fs.unlinkSync(out); } catch { /* best effort cleanup */ }
  }
  try { fs.unlinkSync(assPath); } catch { /* best effort cleanup */ }
  return results;
}

export const GET = withAdmin(async () => {
  const tmp = os.tmpdir();

  // ── Bundled runtime ──
  const binInfo = ffmpegBinaryInfo();
  const bundled = await probeBinary(ffmpegBin);

  // ── System candidates ──
  const system: BinaryProbe[] = [];
  const seen = new Set<string>([ffmpegBin]);
  for (const candidate of SYSTEM_CANDIDATES) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    system.push(await probeBinary(candidate));
  }

  // ── Direct smoke tests ──
  // Bundled always (establishes the failing baseline); the first viable
  // system candidate only, to keep this deploy cheap.
  const bundledSmoke = await smokeTests(ffmpegBin, tmp);
  const viableCandidate = system.find(isViable);
  const systemSmoke = viableCandidate ? await smokeTests(viableCandidate.path, tmp) : null;

  const allSystemSmokePassed = systemSmoke !== null && systemSmoke.every((r) => r.passed);
  const decision = viableCandidate && allSystemSmokePassed
    ? "VIABLE SYSTEM FFMPEG FOUND"
    : "SYSTEM FFMPEG OPTION ELIMINATED";

  // ── Filesystem ──
  let tmpWritable = true;
  let tmpWriteError: string | null = null;
  const probeFile = path.join(tmp, `diag-write-probe-${Date.now()}.tmp`);
  try { fs.writeFileSync(probeFile, "probe"); fs.unlinkSync(probeFile); }
  catch (e) { tmpWritable = false; tmpWriteError = e instanceof Error ? e.message : String(e); }

  // ── Phase 8: one concise structured event. Paths, versions and capability
  // booleans only — no secrets, no media URLs, no env values. ──
  logger.info("editor-render-runtime-capabilities", "P0-2 runtime capability probe", {
    bundledPath: bundled.path,
    bundledVersion: bundled.versionFirstLine ?? null,
    bundledMissingFilters: bundled.missingFilters ?? null,
    bundledMissingEncoders: Object.entries(bundled.encoders ?? {}).filter(([, v]) => !v).map(([k]) => k),
    systemCandidatePath: viableCandidate?.path ?? null,
    systemVersion: viableCandidate?.versionFirstLine ?? null,
    systemMissingFilters: viableCandidate?.missingFilters ?? null,
    bundledSmoke: bundledSmoke.map((r) => `${r.name}=${r.passed ? "PASS" : "FAIL"}`),
    systemSmoke: systemSmoke?.map((r) => `${r.name}=${r.passed ? "PASS" : "FAIL"}`) ?? null,
    decision,
  });

  return NextResponse.json({
    note: "REPORT-ONLY. This route does not change binary selection or any runtime behaviour.",
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cwd: process.cwd(),
      tmpdir: tmp,
      tmpWritable,
      tmpWriteError,
    },
    requiredCapabilities: {
      filters: REQUIRED_FILTERS,
      videoEncoder: REQUIRED_VIDEO_ENCODER,
      audioEncoder: REQUIRED_AUDIO_ENCODER,
      source: "traced from lib/editor/filtergraph.ts and utils/ffmpeg-render.ts encodeArgs('cpu')",
    },
    bundled: { ...bundled, bundledFlag: binInfo.bundled, smokeTests: bundledSmoke },
    systemCandidates: system,
    viableSystemCandidate: viableCandidate?.path ?? null,
    systemSmokeTests: systemSmoke,
    decision,
  });
});
