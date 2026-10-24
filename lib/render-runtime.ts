// Clipiro's render-runtime contract: the capabilities an ffmpeg binary must
// have before it is allowed to accept render work, plus the probe that
// verifies them and the health gate that enforces them.
//
// Single source of truth, deliberately. P0-2 happened because the deployed
// binary silently lacked one filter (`drawtext`) that four separate render
// paths depend on, and nothing checked before charging a credit and
// enqueueing a render that could only fail. Everything that needs to know
// "is this runtime usable" — the startup/deploy verifier, the export API, and
// the admin diagnostics route — reads this file rather than its own list.

import { spawn } from "child_process";

/**
 * Every filter lib/editor/filtergraph.ts and lib/editor/types.ts's
 * FILTER_PRESETS / EFFECT_PRESETS / TRANSITION_PRESETS can emit, plus the
 * AutoClip and streamer-video paths, which share the same binary.
 *
 * `drawtext` is the one P0-2 turned on: it is emitted by editor text clips,
 * the editor free-tier watermark, the AutoClip free-tier watermark and
 * streamer-video titles. `subtitles` (libass) is listed independently — the
 * caption path depends on it separately and its presence must never be
 * inferred from drawtext's.
 * Caption templates burn through `ass` (same libass, but with complex
 * shaping for Devanagari); the editor's plain cues still use `subtitles`.
 */
export const REQUIRED_FILTERS = [
  "adelay", "afade", "aformat", "amix", "anullsrc", "ass", "asetpts", "atempo", "atrim",
  "color", "colorbalance", "colorchannelmixer", "concat", "crop", "drawtext",
  "eq", "fade", "format", "fps", "hue", "noise", "overlay", "rgbashift",
  "scale", "setpts", "setsar", "settb", "subtitles", "tpad", "trim",
  "vignette", "volume", "xfade", "zoompan",
] as const;

// Traced from the real production render commands, not assumed:
// lib/editor/filtergraph.ts and encodeArgs("cpu") in utils/ffmpeg-render.ts
// both request libx264 + aac. h264_nvenc belongs to the gpu path, which is
// unused in production per lib/render-target.ts, so it is not required.
export const REQUIRED_VIDEO_ENCODER = "libx264";
export const REQUIRED_AUDIO_ENCODER = "aac";

export interface RuntimeCapabilities {
  ok: boolean;
  binaryPath: string;
  version: string | null;
  /** Populated when the binary could not be executed at all. */
  spawnError: string | null;
  missingFilters: string[];
  missingEncoders: string[];
  totalFilters: number;
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

function exec(bin: string, args: string[], timeoutMs = 15_000): Promise<{ code: number | null; stdout: string; stderr: string; spawnError: string | null }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", spawnError: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    const done = (r: { code: number | null; spawnError: string | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Never truncate before the caller can search it — a tail slice once
      // cut libx264/aac out of a long `-encoders` listing and produced a
      // false "encoder missing" reading.
      resolve({ ...r, stdout, stderr });
    };
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => done({ code, spawnError: null }));
    proc.on("error", (err) => done({ code: null, spawnError: err.message }));
  });
}

/**
 * Ask a specific binary what it can actually do.
 *
 * Reads `-filters` and `-encoders` from the binary itself. Build
 * configuration flags are deliberately NOT used to decide this: the P0-2
 * binary reports `--enable-libfreetype` and still has no drawtext, so flags
 * are supporting evidence at best and misleading at worst.
 */
export async function probeRuntimeCapabilities(binaryPath: string): Promise<RuntimeCapabilities> {
  const version = await exec(binaryPath, ["-version"], 10_000);
  if (version.spawnError || version.code !== 0) {
    return {
      ok: false,
      binaryPath,
      version: null,
      spawnError: version.spawnError ?? `exit ${version.code}`,
      missingFilters: [...REQUIRED_FILTERS],
      missingEncoders: [REQUIRED_VIDEO_ENCODER, REQUIRED_AUDIO_ENCODER],
      totalFilters: 0,
    };
  }

  const filtersOut = await exec(binaryPath, ["-hide_banner", "-filters"]);
  const available = new Set(parseFilterNames(filtersOut.stdout));
  const encodersOut = await exec(binaryPath, ["-hide_banner", "-encoders"]);
  const hasEncoder = (n: string) => new RegExp(`\\b${n}\\b`).test(encodersOut.stdout);

  const missingFilters = REQUIRED_FILTERS.filter((f) => !available.has(f));
  const missingEncoders = [REQUIRED_VIDEO_ENCODER, REQUIRED_AUDIO_ENCODER].filter((e) => !hasEncoder(e));

  return {
    ok: missingFilters.length === 0 && missingEncoders.length === 0,
    binaryPath,
    version: version.stdout.split("\n")[0]?.trim() ?? null,
    spawnError: null,
    missingFilters,
    missingEncoders,
    totalFilters: available.size,
  };
}

/** Thrown/returned code for a runtime that cannot serve renders. */
export const RENDER_RUNTIME_UNHEALTHY = "RENDER_RUNTIME_UNHEALTHY";

/**
 * User-facing text for an unhealthy runtime. Deliberately says nothing about
 * ffmpeg, filters or binaries — a capability gap is an operational fault, not
 * something the user can act on or should have to read about.
 */
export const RENDER_RUNTIME_UNAVAILABLE_MESSAGE =
  "Video export is temporarily unavailable. Please try again shortly.";

let cached: Promise<RuntimeCapabilities> | null = null;

/**
 * Cached health check for the process's selected ffmpeg binary.
 *
 * Cached because it spawns ffmpeg twice and the answer cannot change without
 * a redeploy (the binary is pinned and installed at deploy time). A failed
 * probe is NOT cached, so a transient spawn failure doesn't wedge the service
 * into permanently refusing exports.
 */
export async function getRenderRuntimeHealth(binaryPath: string): Promise<RuntimeCapabilities> {
  if (!cached) {
    cached = probeRuntimeCapabilities(binaryPath).then((result) => {
      if (!result.ok) cached = null;
      return result;
    }).catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** Test seam — lets a suite exercise the gate without a real binary. */
export function resetRenderRuntimeHealthCache(): void {
  cached = null;
  shapingCached = null;
}

// ── Complex-script shaping (Hindi captions) ─────────────────────────────────
// Devanagari only renders correctly when libass shapes it with HarfBuzz: KA +
// VIRAMA + SSA must become one conjunct glyph. Build flags can't answer this
// (ffmpeg's --enable-libharfbuzz is about drawtext; libass has its own), and
// the `subtitles` filter never shapes at all, which is why captions use the
// `ass` filter with shaping=complex. The probe asks the binary directly, with
// that exact filter: render the conjunct, then the same letters with a
// zero-width non-joiner that forbids it. Shaped output is clearly narrower.

let shapingCached: Promise<boolean> | null = null;

function inkWidth(log: string): number | null {
  const m = [...log.matchAll(/crop=(\d+):\d+:\d+:\d+/g)].pop();
  return m ? Number(m[1]) : null;
}

async function renderedTextWidth(binaryPath: string, fontsDir: string, text: string): Promise<number | null> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shaping-"));
  const ass = path.join(dir, "t.ass");
  fs.writeFileSync(ass, [
    "[Script Info]", "ScriptType: v4.00+", "PlayResX: 600", "PlayResY: 200", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Mukta ExtraBold,120,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,${text}`, "",
  ].join("\n"));
  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  const r = await exec(binaryPath, [
    "-hide_banner", "-f", "lavfi", "-i", "color=black:s=600x200:d=0.4",
    "-vf", `ass=filename='${esc(ass)}':fontsdir='${esc(fontsDir)}':shaping=complex,cropdetect=limit=0.1:round=2:reset=1`,
    "-frames:v", "6", "-f", "null", "-",
  ]);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  return inkWidth(r.stderr);
}

export async function probeComplexShaping(binaryPath: string, fontsDir: string): Promise<boolean> {
  const conjunct = await renderedTextWidth(binaryPath, fontsDir, "\u0915\u094D\u0937");
  const broken = await renderedTextWidth(binaryPath, fontsDir, "\u0915\u094D\u200C\u0937");
  if (!conjunct || !broken) return false;
  return conjunct < broken * 0.9;
}

/** Cached; a failed probe (spawn error, no output) is retried next time. */
export function getComplexShapingSupport(binaryPath: string, fontsDir: string): Promise<boolean> {
  if (!shapingCached) {
    shapingCached = probeComplexShaping(binaryPath, fontsDir).catch(() => false).then((ok) => {
      if (!ok) shapingCached = null;
      return ok;
    });
  }
  return shapingCached;
}
