import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { WordTiming } from "./elevenlabs";
import ffmpegStatic from "ffmpeg-static";
import { ensureExecutable } from "@/lib/ensure-executable";
import { logger } from "@/lib/logger";
import { resolveFontFile, escapeFilterPath } from "@/lib/editor/filtergraph";

/**
 * The pinned, application-owned Linux render runtime installed by
 * scripts/install-render-ffmpeg.mjs (SHA-256 verified at install time).
 *
 * Exists because ffmpeg-static's Linux asset lacks `drawtext` — see that
 * script's header and docs/editor-release-gate-stage1-production-verification.md.
 * Kept outside node_modules so a package reinstall cannot silently replace a
 * verified runtime.
 */
const PINNED_RUNTIME_PATH = path.join(process.cwd(), "vendor", "ffmpeg", "ffmpeg");

// Next.js bundles ffmpeg-static and rewrites its internal __dirname to a literal
// "\ROOT\...", which makes the exported path point at a file that doesn't exist.
// Resolve the real binary ourselves rather than trusting the export blindly.
//
// Resolution order, most authoritative first:
//   1. CLIPIRO_FFMPEG_PATH — explicit operator override, for pinning a
//      specific binary without a code change.
//   2. The pinned, checksum-verified runtime (Linux production).
//   3. ffmpeg-static's bundled binary — the development path. On Windows and
//      macOS this release ships ffmpeg 6.1.1, which HAS drawtext; on Linux it
//      ships 7.0.2, which does not, so in production this is a fallback that
//      the runtime health gate will correctly refuse to render with.
//   4. Bare "ffmpeg" on PATH — LOCAL DEVELOPMENT ONLY. Production has no
//      system ffmpeg (every candidate path returned ENOENT), so this is not
//      and must not become the production answer.
function resolveFfmpegBin(): string {
  // An explicit override that points nowhere is an operator error, not a
  // reason to quietly use something else. Silent fallback to a different
  // binary than the one configured is the exact failure shape behind P0-2.
  const override = process.env.CLIPIRO_FFMPEG_PATH;
  if (override && !fs.existsSync(override)) {
    throw new Error(`CLIPIRO_FFMPEG_PATH is set to "${override}" but no file exists there — refusing to silently fall back to a different ffmpeg.`);
  }

  const candidates = [
    override,
    PINNED_RUNTIME_PATH,
    ffmpegStatic ?? undefined,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
  ];
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    // The standalone build ships this binary but the deploy can strip its
    // execute bit — restore it here, in-process, after every copy/extract,
    // or every spawn dies with EACCES (which is exactly what took prod down).
    ensureExecutable(candidate);
    return candidate;
  }
  return "ffmpeg";
}

// Exported so other modules that spawn ffmpeg directly (e.g. lib/signal-track)
// share this one resolved, exec-bit-restored path instead of recomputing it.
export const ffmpegBin = resolveFfmpegBin();

/**
 * Where ffmpeg was resolved from, and whether that path exists on disk.
 *
 * `resolveFfmpegBin` silently falls back to bare "ffmpeg" on PATH, which may
 * not exist in a standalone deploy — and when it doesn't, every probe and
 * render fails in a way that looks like bad user media rather than a missing
 * binary. Exposed so startup can say so once, out loud.
 */
export function ffmpegBinaryInfo(): { path: string; bundled: boolean } {
  return { path: ffmpegBin, bundled: ffmpegBin !== "ffmpeg" && fs.existsSync(ffmpegBin) };
}

// Renders run one at a time per queue with no other watchdog (see lib/job-queue.ts)
// — a single wedged ffmpeg process (corrupt input, a codec that hangs) would
// otherwise block every subsequent job in that queue forever. Kill anything
// that runs past this and reject/resolve accordingly.
const DEFAULT_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;

function killAfterTimeout(proc: ReturnType<typeof spawn>, timeoutMs: number, onTimeout: () => void): () => void {
  const timer = setTimeout(() => {
    proc.kill("SIGKILL");
    onTimeout();
  }, timeoutMs);
  return () => clearTimeout(timer);
}

// ── Output encoding ─────────────────────────────────────────────────────────

export type RenderTarget = "cpu" | "gpu";

/**
 * Output encoder arguments. Every render used to hardcode
 * `-c:v libx264 -preset superfast -crf 23 -c:a aac` in four separate places;
 * this is the single place to change them, and the seam the GPU worker pool
 * routes through (see lib/render-target.ts).
 *
 * Two flags apply to BOTH targets and were missing everywhere before:
 *  - `-pix_fmt yuv420p`: some sources decode to a pixel format Safari and
 *    most social platforms refuse to play.
 *  - `-movflags +faststart`: moves the moov atom to the front so playback can
 *    begin before the whole file has downloaded. Without it every clip
 *    preview stalls until fully buffered.
 */
export function encodeArgs(target: RenderTarget = "cpu"): string[] {
  const common = ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"];
  if (target === "gpu") {
    // NVENC has no -crf; the analogous quality-targeting control is -cq under
    // -rc vbr, and -b:v 0 is REQUIRED or -cq is silently ignored and you get a
    // default bitrate instead. p5 sits near x264 superfast for speed while
    // landing close to crf 23 perceptually; p7 is closer in quality but gives
    // back most of the speed advantage.
    return [
      "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq",
      "-rc", "vbr", "-cq", "21", "-b:v", "0",
      "-maxrate", "12M", "-bufsize", "24M", "-profile:v", "high",
      ...common,
    ];
  }
  // `-threads 1` (SEV-1, P0-2): the production host's CPU advertises AVX-512
  // via cpuid and x264 detects it fine, but actually using it under x264's
  // default multi-threaded slicing fails encoder init outright ("Error while
  // opening encoder" immediately after the cpu-capabilities log line, exit
  // 187) — a known class of hypervisor/kernel bug where AVX-512 execution
  // state isn't handled correctly across thread context switches. Forcing
  // libx264 to single-threaded mode (ffmpeg's own -threads is read into
  // libx264's thread count by libavcodec's wrapper) sidesteps it. Confirmed
  // empirically against the real production host at both a synthetic
  // resolution and this app's actual 1080x1920 export size — default
  // threading reproduces the failure at both, -threads 1 fixes both. See
  // docs/editor-release-gate-stage1-production-verification.md's P0-2
  // incident section.
  return ["-threads", "1", "-c:v", "libx264", "-preset", "superfast", "-crf", "23", ...common];
}

/**
 * Moves an oversized filtergraph out of argv and into a file.
 *
 * The pan/zoom expressions are piecewise-linear chains — one nesting level per
 * keyframe, across four expressions — so a long clip with a moving subject
 * produces tens of KB of filtergraph. Windows caps a command line at ~32k and
 * fails opaquely past it. ffmpeg accepts the graph from a file instead, which
 * removes the ceiling entirely.
 *
 * Mirrors lib/editor/filtergraph.ts's maybeUseFilterScript, which solves the
 * same problem for the editor's renderer, but takes plain args so the AutoClip
 * pipeline (which builds its graph differently) can share the behaviour.
 */
export function maybeUseFilterScript(args: string[], scriptPath: string, threshold = 6000): string[] {
  const complexIdx = args.indexOf("-filter_complex");
  const vfIdx = args.indexOf("-vf");
  const idx = complexIdx >= 0 ? complexIdx : vfIdx;
  if (idx < 0) return args;

  const graph = args[idx + 1];
  if (typeof graph !== "string" || graph.length < threshold) return args;

  fs.writeFileSync(scriptPath, graph, "utf8");
  const out = [...args];
  out.splice(idx, 2, complexIdx >= 0 ? "-filter_complex_script" : "-filter_script:v", scriptPath);
  return out;
}

export interface SubtitleStyle {
  fontName?: string;
  fontSize?: number;
  highlightColor?: string; // ASS color e.g. "&H0000FFFF"
  baseColor?: string;      // ASS color e.g. "&H00FFFFFF"
  outlineColor?: string;   // ASS color
  shadowColor?: string;    // ASS color
  outlineWidth?: number;
  shadowDepth?: number;
  borderStyle?: number;    // 1 = outline + shadow, 3 = box background
  alignment?: number;      // ASS alignment (5=center, 2=bottom, etc.)
  animated?: boolean;
  /** Speech-reactive animation inputs; omitted = neutral animation. */
  motion?: CaptionMotion;
}

// ── Animated captions ───────────────────────────────────────────────────────
// The previous "animated" mode set the active word to a flat 118% and swapped
// its colour. That is a step change with no easing and no relationship to what
// is being said — the same animation on a whispered aside and a shouted
// punchline.
//
// These knobs drive an eased, speech-reactive treatment. All of it is plain
// libass override tags, so there is no new dependency and no change to how the
// subtitle file is burned in.

export interface CaptionMotion {
  /** Per-word intensity 0..1, aligned to `words` (from the clip's signal track). */
  energy?: number[];
  /** Indices of words the LLM marked as emphatic. */
  emphasis?: number[];
  /** Words per second, used to pick transition speed and line length. */
  wordsPerSec?: number;
  /** Word index → emoji, from the caption template (lib/caption-templates.ts). */
  emoji?: Record<number, string>;
  /** ASS colour applied to emphasis words, when the template highlights them. */
  keywordColor?: string;
}

// Readability constraints. These are limits, not preferences: past ~1.25x a
// word visibly reflows its neighbours, and animating the outline width makes
// thin fonts strobe.
const MAX_WORD_SCALE = 1.25;
const BASE_WORD_SCALE = 1.10;
const POP_IN_MS = 90;
const POP_OUT_MS = 90;

function scaleTag(scale: number): string {
  const pct = Math.round(scale * 100);
  return `\\fscx${pct}\\fscy${pct}`;
}

/**
 * Builds the Dialogue events for the animated caption mode.
 *
 * One event per (line, active word) as before, but the active word now eases
 * in and back out, and how far it scales — plus whether it glows — depends on
 * the speech energy at that moment and whether the LLM flagged it.
 */
export function buildAnimatedEvents(
  words: WordTiming[],
  colors: { highlight: string; base: string },
  motion?: CaptionMotion,
): string {
  const wps = motion?.wordsPerSec ?? 0;
  // Fast speech needs shorter lines and quicker transitions, or the viewer is
  // reading the previous line while hearing the next.
  const wordsPerLine = wps > 3.5 ? 3 : 4;
  const transitionMs = wps > 3.5 ? 60 : wps > 0 && wps < 2 ? 200 : POP_IN_MS;
  const emphasisSet = new Set(motion?.emphasis ?? []);

  let events = "";
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const group = words.slice(i, i + wordsPerLine);
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;

    for (let k = 0; k < group.length; k++) {
      const activeIndex = i + k;
      const activeWord = group[k];
      const wordStart = k === 0 ? groupStart : activeWord.start;
      const wordEnd = k < group.length - 1 ? group[k + 1].start : groupEnd;
      if (wordStart >= wordEnd) continue;

      const energy = motion?.energy?.[activeIndex] ?? 0.5;
      const isEmphasis = emphasisSet.has(activeIndex);
      // Louder / flagged words scale further, quiet ones barely move.
      const peak = Math.min(
        MAX_WORD_SCALE,
        BASE_WORD_SCALE + energy * 0.10 + (isEmphasis ? 0.05 : 0),
      );
      const holdMs = Math.max(0, wordEnd - wordStart - transitionMs - POP_OUT_MS);

      // \t(t1,t2,tags) interpolates, which is what turns a step into a pop:
      // scale up over the transition, hold, then settle back.
      // Emphasis words take the template's keyword colour when it defines one,
      // so the thing the model identified as the point is also the thing that
      // reads as the point.
      const activeColor = isEmphasis && motion?.keywordColor ? motion.keywordColor : colors.highlight;

      const animate =
        `{${scaleTag(1.0)}\\t(0,${transitionMs},${scaleTag(peak)})` +
        `\\t(${transitionMs + holdMs},${transitionMs + holdMs + POP_OUT_MS},${scaleTag(BASE_WORD_SCALE)})` +
        // Glow only on genuinely high-energy words; used everywhere it reads
        // as a blurry font rather than emphasis.
        (energy > 0.7 || isEmphasis ? `\\blur2` : ``) +
        `\\1c${activeColor}}`;

      let lineText = "";
      for (let j = 0; j < group.length; j++) {
        const wordIndex = i + j;
        // Emoji ride along with their word so they inherit its animation and
        // can never end up on a line of their own.
        const suffix = motion?.emoji?.[wordIndex] ? ` ${motion.emoji[wordIndex]}` : "";
        lineText += j === k
          ? `${animate}${group[j].word}${suffix} `
          : `{${scaleTag(1.0)}\\1c${colors.base}}${group[j].word}${suffix} `;
      }
      events += `Dialogue: 0,${toASSTime(wordStart)},${toASSTime(wordEnd)},Default,,0,0,0,,${lineText.trim()}\n`;
    }
  }
  return events;
}

export function toASSTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

export function generateASS(
  words: WordTiming[],
  style: SubtitleStyle,
  assPath: string
): void {
  const fontName = style.fontName ?? "Outfit";
  const fontSize = style.fontSize ?? 80;
  const highlight = style.highlightColor ?? "&H0000FFFF";
  const base = style.baseColor ?? "&H00FFFFFF";
  const outlineCol = style.outlineColor ?? "&H00000000";
  const shadowCol = style.shadowColor ?? "&H00000000";
  const borderStyle = style.borderStyle ?? 1;
  const outline = style.outlineWidth ?? 8;
  const shadow = style.shadowDepth ?? 0;
  const alignment = style.alignment ?? 5;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${highlight},${base},${outlineCol},${shadowCol},-1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (style.animated) {
    fs.writeFileSync(assPath, header + buildAnimatedEvents(words, { highlight, base }, style.motion), "utf8");
    return;
  }

  const WORDS_PER_LINE = 5;
  let events = "";

  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const group = words.slice(i, i + WORDS_PER_LINE);
    const start = toASSTime(group[0].start);
    const end = toASSTime(group[group.length - 1].end);
    let text = "";
    for (const w of group) {
      const durationCs = Math.max(1, Math.round((w.end - w.start) / 10));
      text += `{\\kf${durationCs}}${w.word} `;
    }
    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text.trim()}\n`;
  }

  fs.writeFileSync(assPath, header + events, "utf8");
}

export interface RenderOptions {
  bgVideoPath: string;   // local file or s3 presigned url
  voiceAudioPath: string;
  musicAudioPath?: string;
  assPath: string;
  outputPath: string;
}

export function runFFmpeg(opts: RenderOptions, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const { bgVideoPath, voiceAudioPath, musicAudioPath, assPath, outputPath } = opts;

    // Escape the ass path for the subtitles filter (forward slashes, escape colons on Windows)
    const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    let args: string[];

    if (musicAudioPath) {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", voiceAudioPath,
        "-i", musicAudioPath,
        "-filter_complex",
        `[2:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio];[0:v]crop=in_h*9/16:in_h,subtitles='${assEscaped}'[video]`,
        "-map", "[video]",
        "-map", "[audio]",
        ...encodeArgs(),
        "-shortest",
        outputPath,
      ];
    } else {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", voiceAudioPath,
        "-filter_complex",
        `[0:v]crop=in_h*9/16:in_h,subtitles='${assEscaped}'[video]`,
        "-map", "[video]",
        "-map", "1:a",
        ...encodeArgs(),
        "-shortest",
        outputPath,
      ];
    }

    const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => {
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms and was killed`));
    });

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      clearWatchdog();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited ${code}:\n${stderrBuf.slice(-2000)}`));
      }
    });

    proc.on("error", (err) => { clearWatchdog(); reject(err); });
  });
}

// ── Generic FFmpeg runner ────────────────────────────────────────────────────

export function runFFmpegArgs(args: string[], timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => {
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms and was killed`));
    });
    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    proc.on("close", (code) => {
      clearWatchdog();
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}:\n${stderrBuf.slice(-2000)}`));
    });
    proc.on("error", (err) => { clearWatchdog(); reject(err); });
  });
}

export interface DurationProbe {
  /** Seconds, or null when the probe itself failed (NOT "a zero-length video"). */
  durationSec: number | null;
  /** Why it failed, for diagnostics. Empty on success. */
  reason: string;
  /** Tail of ffmpeg's stderr, for the log. */
  stderrTail: string;
  fileBytes: number;
}

/**
 * Probe a media file's duration, distinguishing "couldn't read it" from
 * "it's short".
 *
 * That distinction matters: `getMediaDurationSec` collapses every failure to
 * 0, and a caller comparing 0 against a minimum concludes "this video is too
 * short" — telling the user their file is the problem when the real cause was
 * a missing ffmpeg binary, a truncated download, or an unreadable container.
 * That misdiagnosis reached production.
 */
export function probeMediaDuration(filePath: string, timeoutMs = 30_000): Promise<DurationProbe> {
  return new Promise((resolve) => {
    let fileBytes = 0;
    try { fileBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0; } catch { /* reported below */ }

    if (fileBytes === 0) {
      resolve({
        durationSec: null,
        reason: fs.existsSync(filePath) ? "file is empty (0 bytes)" : "file does not exist",
        stderrTail: "",
        fileBytes,
      });
      return;
    }

    const proc = spawn(ffmpegBin!, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () =>
      resolve({ durationSec: null, reason: `probe timed out after ${timeoutMs}ms`, stderrTail: "", fileBytes }));

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    proc.on("close", () => {
      clearWatchdog();
      const tail = stderrBuf.slice(-1200);
      const d = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderrBuf);
      if (!d) {
        // "N/A" is ffmpeg's own answer for a container it opened but whose
        // duration it cannot determine — worth distinguishing from a file it
        // could not decode at all.
        const reason = /Duration:\s*N\/A/.test(stderrBuf)
          ? "ffmpeg opened the file but reported no duration"
          : "ffmpeg could not read the file";
        resolve({ durationSec: null, reason, stderrTail: tail, fileBytes });
        return;
      }
      resolve({
        durationSec: parseInt(d[1]) * 3600 + parseInt(d[2]) * 60 + parseFloat(d[3]),
        reason: "",
        stderrTail: "",
        fileBytes,
      });
    });

    proc.on("error", (err) => {
      clearWatchdog();
      // Almost always a missing binary: resolveFfmpegBin falls back to bare
      // "ffmpeg" on PATH, which may not exist in a standalone deploy.
      resolve({
        durationSec: null,
        reason: `could not run ffmpeg (${ffmpegBin}): ${err.message}`,
        stderrTail: "",
        fileBytes,
      });
    });
  });
}

// Probe a media file's duration in seconds by reading FFmpeg's "Duration:" line.
// Returns 0 if the duration can't be determined — callers that need to tell a
// failed probe apart from a genuinely short file must use probeMediaDuration.
export async function getMediaDurationSec(filePath: string, timeoutMs = 30_000): Promise<number> {
  return (await probeMediaDuration(filePath, timeoutMs)).durationSec ?? 0;
}

// Probe a video's pixel dimensions from FFmpeg's "Video: ... WxH" stderr line.
// Returns {w:0,h:0} if it can't be determined (callers should treat that as
// "dimensions unknown" and skip anything that depends on them).
export function getMediaDimensions(filePath: string, timeoutMs = 30_000): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin!, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => resolve({ w: 0, h: 0 }));
    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    const finish = () => {
      clearWatchdog();
      const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderrBuf);
      if (!m) return resolve({ w: 0, h: 0 });
      resolve({ w: parseInt(m[1], 10), h: parseInt(m[2], 10) });
    };
    proc.on("close", finish);
    proc.on("error", () => { clearWatchdog(); resolve({ w: 0, h: 0 }); });
  });
}

// Like runFFmpegArgs but parses FFmpeg's stderr for the input "Duration:" and the
// running "time=" markers to report real conversion progress (0–99).
export function runFFmpegWithProgress(
  args: string[],
  onProgress: (pct: number) => void,
  timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => {
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms and was killed`));
    });
    let stderrBuf = "";
    let totalMs = 0;

    const hms = (h: string, m: string, s: string) =>
      (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;

    proc.stderr.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stderrBuf += s;

      if (totalMs === 0) {
        const d = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderrBuf);
        if (d) totalMs = hms(d[1], d[2], d[3]);
      }

      // Take the last time= marker in this chunk.
      const re = /time=\s*(\d+):(\d+):(\d+\.\d+)/g;
      let last: RegExpExecArray | null = null, m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) last = m;
      if (last && totalMs > 0) {
        const cur = hms(last[1], last[2], last[3]);
        onProgress(Math.max(0, Math.min(99, (cur / totalMs) * 100)));
      }
    });

    proc.on("close", (code) => {
      clearWatchdog();
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}:\n${stderrBuf.slice(-2000)}`));
    });
    proc.on("error", (err) => { clearWatchdog(); reject(err); });
  });
}

// ── Audio extraction ─────────────────────────────────────────────────────────

export function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return runFFmpegArgs(["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "3", audioPath]);
}

// ── Audio analysis (for AutoClip's calibrated virality score) ──────────────

export interface AudioAnalysis { meanVolumeDb: number; maxVolumeDb: number; silenceSec: number }

// Best-effort loudness/silence analysis via ffmpeg's silencedetect+volumedetect
// audio filters. Never rejects — a failed/timed-out analysis resolves with
// neutral defaults so a scoring pass can never block a render.
export function analyzeAudio(filePath: string, timeoutMs = 60_000): Promise<AudioAnalysis> {
  const NEUTRAL: AudioAnalysis = { meanVolumeDb: -30, maxVolumeDb: -10, silenceSec: 0 };
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin!, [
      "-i", filePath,
      "-af", "silencedetect=noise=-30dB:d=0.3,volumedetect",
      "-f", "null", "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => resolve(NEUTRAL));
    let buf = "";
    proc.stderr.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
    proc.on("close", () => {
      clearWatchdog();
      const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)/.exec(buf);
      const max = /max_volume:\s*(-?\d+(?:\.\d+)?)/.exec(buf);
      const silenceSec = [...buf.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/g)]
        .reduce((sum, m) => sum + parseFloat(m[1]), 0);
      resolve({
        meanVolumeDb: mean ? parseFloat(mean[1]) : NEUTRAL.meanVolumeDb,
        maxVolumeDb: max ? parseFloat(max[1]) : NEUTRAL.maxVolumeDb,
        silenceSec,
      });
    });
    proc.on("error", () => { clearWatchdog(); resolve(NEUTRAL); });
  });
}

// ── Split-screen (vstack) ────────────────────────────────────────────────────

export interface SplitScreenOptions {
  userVideoPath: string;
  bgVideoPath: string;
  assPath: string;
  outputPath: string;
}

export function runSplitScreenFFmpeg(opts: SplitScreenOptions): Promise<void> {
  const { userVideoPath, bgVideoPath, assPath, outputPath } = opts;
  const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  return runFFmpegArgs([
    "-y",
    "-i", userVideoPath,
    "-stream_loop", "-1", "-i", bgVideoPath,
    "-filter_complex",
    `[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];` +
    `[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bot];` +
    // shortest=1 makes vstack end with the (finite) user video; without it the
    // infinitely -stream_loop'd background drives the output forever, duplicating
    // the user's last frame and producing a runaway file that never completes.
    `[top][bot]vstack=inputs=2:shortest=1[stacked];` +
    `[stacked]subtitles='${assEscaped}'[video];` +
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[audio]`,
    "-map", "[video]",
    "-map", "[audio]",
    ...encodeArgs(), "-shortest",
    outputPath,
  ]);
}

// ── Streamer video (crop + drawtext) ────────────────────────────────────────

export interface DrawtextOptions {
  fontcolor: string;
  fontsize: number;
  fontname: string;
  shadowcolor: string;
  bordercolor: string;
  borderw: number;
}

/**
 * The font file a Streamer title should actually be drawn with.
 *
 * `resolveFontFile` is the authoritative resolver (shared with the editor
 * renderer): it maps a family to a bundled TTF, or to the platform's system
 * path for the three legacy families, and throws when nothing usable exists.
 *
 * A throw must not fail a render that would previously have produced *some*
 * output, so an unavailable family falls back to a font that ships in this
 * repository and is therefore always present. That keeps the choice
 * deterministic and ours — the one thing we must never do is hand drawtext no
 * font and let the host pick.
 */
export const STREAMER_FALLBACK_FONT = path.join(process.cwd(), "public/fonts/Poppins-Bold.ttf");

export function streamerFontFile(family: string): string {
  try {
    return resolveFontFile(family);
  } catch (err) {
    logger.warn("streamer-video", `no font file for "${family}", using the bundled Clipiro fallback`, err);
    return STREAMER_FALLBACK_FONT;
  }
}

export interface StreamerVideoOptions {
  userVideoPath: string;
  titleText: string;
  drawtextOpts: DrawtextOptions;
  outputPath: string;
}

export function runStreamerFFmpeg(opts: StreamerVideoOptions): Promise<void> {
  const { userVideoPath, titleText, drawtextOpts, outputPath } = opts;
  // Escape special chars for FFmpeg drawtext
  const escapedText = titleText
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

  const dt = drawtextOpts;
  // The style's font family used to be computed and then thrown away: this
  // filter carried no `fontfile=` and no `font=`, so every one of the 16 title
  // styles rendered in whatever family fontconfig picked as its default. That
  // made the styles differ only in colour and size, and made rendering depend
  // on the host having a usable default font at all — which the build-time
  // runtime gate does NOT prove, since its drawtext smoke passes an explicit
  // fontfile. Resolve the family to a real file and pass it explicitly, using
  // the same resolver the editor renderer uses.
  const drawFilter =
    `drawtext=text='${escapedText}':fontfile='${escapeFilterPath(streamerFontFile(dt.fontname))}':` +
    `fontsize=${dt.fontsize}:fontcolor=${dt.fontcolor}:` +
    `x=(w-text_w)/2:y=h*0.08:borderw=${dt.borderw}:bordercolor=${dt.bordercolor}:` +
    `shadowx=2:shadowy=2:shadowcolor=${dt.shadowcolor}`;

  return runFFmpegArgs([
    "-y", "-i", userVideoPath,
    "-vf", `crop=in_h*9/16:in_h,${drawFilter}`,
    ...encodeArgs(),
    outputPath,
  ]);
}

// ── Style-index → SubtitleStyle (for ASS subtitles) ────────────────────────

const W = "&H00FFFFFF"; // white
const Y = "&H0015CCFA"; // yellow  (#facc15 → BGR)
const C = "&H00EED322"; // cyan    (#22d3ee → BGR)
const G = "&H004ADE80"; // green   (#4ade80 → BGR)
const B = "&H00F6823B"; // blue    (#3b82f6 → BGR)
const P = "&H00D4B5C4"; // pink/purple (#c4b5fd → BGR)

export function styleIndexToSubtitleStyle(index: number, mode: "oneword" | "lines"): SubtitleStyle {
  const oneWord: SubtitleStyle[] = [
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: W },   // 0 white+outline
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: C },   // 1 cyan
    { fontName: "Times New Roman", fontSize: 78, highlightColor: W, baseColor: W }, // 2 Georgia glow
    { fontName: "Times New Roman", fontSize: 74, highlightColor: W, baseColor: W }, // 3 Georgia thin
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: W },   // 4 italic
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: W },   // 5 uppercase
    { fontName: "Arial", fontSize: 76, highlightColor: G, baseColor: G },   // 6 green
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: W },  // 7 Impact italic
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: W },   // 8 italic uppercase
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },   // 9 red badge
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: W },  // 10 Impact
    { fontName: "Arial", fontSize: 74, highlightColor: Y, baseColor: W },   // 11 lighter
    { fontName: "Times New Roman", fontSize: 74, highlightColor: Y, baseColor: Y }, // 12 Georgia yellow
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: Y },  // 13 Impact yellow glow
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: Y },   // 14 yellow
    { fontName: "Arial", fontSize: 76, highlightColor: B, baseColor: B },   // 15 blue
  ];
  const lines: SubtitleStyle[] = [
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: B, baseColor: B },
    { fontName: "Arial", fontSize: 68, highlightColor: Y, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Times New Roman", fontSize: 70, highlightColor: Y, baseColor: Y },
    { fontName: "Impact", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: Y },
    { fontName: "Arial", fontSize: 70, highlightColor: C, baseColor: C },
    { fontName: "Arial", fontSize: 70, highlightColor: G, baseColor: G },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: P, baseColor: P },
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: B },
    { fontName: "Arial", fontSize: 68, highlightColor: W, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: P, baseColor: P },
  ];
  const arr = mode === "lines" ? lines : oneWord;
  return arr[Math.min(index, arr.length - 1)];
}

// ── Style-index → DrawtextOptions (for streamer video) ──────────────────────

export function styleIndexToDrawtext(index: number): DrawtextOptions {
  const map: DrawtextOptions[] = [
    { fontcolor: "white",    fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x22D3EE", fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 72, fontname: "Times New Roman", shadowcolor: "white",   bordercolor: "white",   borderw: 0 },
    { fontcolor: "white",    fontsize: 70, fontname: "Times New Roman", shadowcolor: "white",   bordercolor: "white",   borderw: 0 },
    { fontcolor: "white",    fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x4ADE80", fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 72, fontname: "Impact",          shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "0xEF4444",bordercolor: "0xEF4444",borderw: 8 },
    { fontcolor: "white",    fontsize: 72, fontname: "Impact",          shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 70, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0xFACC15", fontsize: 70, fontname: "Times New Roman", shadowcolor: "black",   bordercolor: "black",   borderw: 2 },
    { fontcolor: "0xFACC15", fontsize: 72, fontname: "Impact",          shadowcolor: "0xFACC15",bordercolor: "black",   borderw: 2 },
    { fontcolor: "0xFACC15", fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x3B82F6", fontsize: 68, fontname: "Arial",           shadowcolor: "white",   bordercolor: "white",   borderw: 3 },
  ];
  return map[Math.min(index, map.length - 1)];
}
