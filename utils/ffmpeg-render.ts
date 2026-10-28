import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
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
  // turbopackIgnore: the output-file tracer can't bound a loop variable over
  // this mixed list, so this one existsSync traced the WHOLE project into
  // .next/standalone. The binaries still ship: next.config.ts lists them in
  // outputFileTracingIncludes (and the two static paths above are traced).
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(/*turbopackIgnore: true*/ candidate)) continue;
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

// Every spawn in this module goes through here. ffmpegBin is a partly-known
// value to the output-file tracer (a literal "ffmpeg" or a path it can't
// bound), and `spawn(ffmpegBin, …)` makes it trace that command — which
// matched the whole project. A turbopackIgnore comment on the argument is not
// honoured for spawn (verified against Next 16.2's Turbopack); passing the
// command through a parameter is, since a parameter is fully opaque to it.
// Typed as `spawn` so each call keeps its overload-specific stdio types.
//
// Every ffmpeg also gets its thread caps (capFfmpegArgs) and a lowered OS
// priority (deprioritize) here, so no call site can forget them.
const spawnFfmpeg = ((cmd: unknown, args: unknown, ...rest: unknown[]) => {
  const proc = (spawn as (...a: unknown[]) => unknown)(cmd, capFfmpegArgs(args as string[]), ...rest);
  deprioritize(proc as ReturnType<typeof spawn>);
  return proc;
}) as typeof spawn;

// Threads per ffmpeg for decoding and filtering. Encoding is already pinned to
// one thread (encodeArgs), but decode and the filtergraph default to one
// thread PER CORE THE OS REPORTS — and production is a shared Hostinger box
// that reports 48 cores while the plan gets only a few. Three parallel clip
// renders therefore ran ~100+ busy threads against that limit: 100% CPU and
// the account's resource limits exhausted for as long as a run lasted.
// FFMPEG_THREADS tunes it per deployment.
export function ffmpegThreads(): number {
  const n = parseInt(process.env.FFMPEG_THREADS || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

/**
 * Caps ffmpeg's decoder and filtergraph threads (see ffmpegThreads). Adds
 * `-filter_threads`/`-filter_complex_threads` as global options and a
 * `-threads` input option before every `-i` that doesn't already set one. An
 * output `-threads` (encodeArgs' libx264 pin) comes after the last `-i`, so
 * it is never mistaken for an input's. Probe-only calls (`-i file` and
 * nothing else) are left as they are.
 */
export function capFfmpegArgs(args: string[]): string[] {
  if (args.length <= 2 || !args.includes("-i")) return args;
  const t = String(ffmpegThreads());
  const out: string[] = args.includes("-filter_threads") ? [] : ["-filter_threads", t, "-filter_complex_threads", t];
  let inputHasThreads = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-threads") inputHasThreads = true;
    if (a === "-i") {
      if (!inputHasThreads) out.push("-threads", t);
      inputHasThreads = false;
    }
    out.push(a);
    if (a === "-i" && i + 1 < args.length) out.push(args[++i]);
  }
  return out;
}

/** Below the web server, so a render can't make the site itself unresponsive. */
export function deprioritize(proc: { pid?: number }): void {
  if (!proc.pid) return;
  try { os.setPriority(proc.pid, 10); } catch { /* not permitted here — harmless */ }
}

/**
 * Where ffmpeg was resolved from, and whether that path exists on disk.
 *
 * `resolveFfmpegBin` silently falls back to bare "ffmpeg" on PATH, which may
 * not exist in a standalone deploy — and when it doesn't, every probe and
 * render fails in a way that looks like bad user media rather than a missing
 * binary. Exposed so startup can say so once, out loud.
 */
export function ffmpegBinaryInfo(): { path: string; bundled: boolean } {
  // turbopackIgnore: same unboundable value as resolveFfmpegBin's loop.
  return { path: ffmpegBin, bundled: ffmpegBin !== "ffmpeg" && fs.existsSync(/*turbopackIgnore: true*/ ffmpegBin) };
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

/** ms → ASS timestamp "H:MM:SS.cc" (the editor's plain caption cues). */
export function toASSTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// ── Generic FFmpeg runner ────────────────────────────────────────────────────

export function runFFmpegArgs(args: string[], timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawnFfmpeg(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
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
  /** The demuxer ffmpeg picked ("mov,mp4,m4a,3gp,3g2,mj2"), when it opened the file. */
  formatName?: string | null;
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

    const proc = spawnFfmpeg(ffmpegBin!, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () =>
      resolve({ durationSec: null, reason: `probe timed out after ${timeoutMs}ms`, stderrTail: "", fileBytes }));

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    proc.on("close", () => {
      clearWatchdog();
      const tail = stderrBuf.slice(-1200);
      const formatName = /Input #0, (.+?), from /.exec(stderrBuf)?.[1] ?? null;
      const d = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderrBuf);
      if (!d) {
        // "N/A" is ffmpeg's own answer for a container it opened but whose
        // duration it cannot determine — worth distinguishing from a file it
        // could not decode at all.
        const reason = /Duration:\s*N\/A/.test(stderrBuf)
          ? "ffmpeg opened the file but reported no duration"
          : "ffmpeg could not read the file";
        resolve({ durationSec: null, reason, stderrTail: tail, fileBytes, formatName });
        return;
      }
      resolve({
        durationSec: parseInt(d[1]) * 3600 + parseInt(d[2]) * 60 + parseFloat(d[3]),
        reason: "",
        stderrTail: "",
        fileBytes,
        formatName,
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

// Containers a user upload may be. ffmpeg PROBES the content, so a renamed file
// is still opened as what it really is — and several demuxers it ships are not
// media at all but indirection: hls/concat playlists name OTHER files and URLs
// for ffmpeg to open (local file reads, and network fetches on builds whose
// defaults allow it), image2/tty/lavfi and friends read or synthesise from
// patterns. Allow-listing the real media containers shuts all of that out.
const SAFE_UPLOAD_FORMATS = new Set([
  "mov", "mp4", "m4a", "3gp", "3g2", "mj2", // ISO-BMFF family (one demuxer)
  "matroska", "webm",
  "avi", "flv", "mpegts", "mpeg", "asf",
  "mp3", "wav", "w64", "aac", "flac", "ogg", "aiff", "caf", "amr",
]);

/** Allowed temp-file extensions for an upload. The extension also steers
 * ffmpeg's detection (it refuses HLS without .m3u8), so it must never come
 * straight from the user's filename. */
export const SAFE_MEDIA_EXTENSIONS = new Set([
  "mp4", "mov", "m4v", "m4a", "3gp", "webm", "mkv", "avi", "flv", "ts", "mpg", "mpeg", "wmv",
  "mp3", "wav", "aac", "flac", "ogg", "oga", "opus", "aiff", "caf", "amr",
]);

/** The upload's extension if it is a known media extension, else `fallback`. */
export function safeMediaExtension(fileName: string, fallback: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return SAFE_MEDIA_EXTENSIONS.has(ext) ? ext : fallback;
}

export interface UploadProbe {
  /** 0 when ffmpeg could not read a duration. */
  durationSec: number;
  formatName: string | null;
  /** False for anything that isn't a plain media container — reject it before charging. */
  safe: boolean;
}

/** Duration plus the container check, in the one ffmpeg run every tool route already makes. */
export async function probeUploadedMedia(filePath: string): Promise<UploadProbe> {
  const probe = await probeMediaDuration(filePath);
  const formatName = probe.formatName ?? null;
  const safe = !!formatName && formatName.split(",").every((n) => SAFE_UPLOAD_FORMATS.has(n.trim()));
  return { durationSec: probe.durationSec ?? 0, formatName, safe };
}

export const UNSAFE_MEDIA_MESSAGE = "This file type isn't supported. Upload a regular audio or video file (MP4, MOV, WEBM, MP3, WAV…).";

/**
 * Re-encode an upload to an audio-only MP3 no longer than `maxSec`, for the
 * tools that bill by length and then send the audio to a per-second provider.
 *
 * The probed duration comes from the container header, which the uploader
 * controls: a file can claim 5 s and hold 90 s. Sending the ORIGINAL file meant
 * billing for the claim and paying the provider for the reality. Sending this
 * output instead caps what reaches the provider at what was billed, whatever
 * the header says. It also drops any video stream, so a video upload is not
 * shipped to an audio API in full.
 */
export function trimAudioForProvider(inputPath: string, outputPath: string, maxSec: number, bitrate = "192k"): Promise<void> {
  return runFFmpegArgs([
    "-y", "-i", inputPath,
    "-vn", "-t", String(Math.max(1, Math.ceil(maxSec))),
    "-c:a", "libmp3lame", "-b:a", bitrate,
    outputPath,
  ]);
}

// Probe a video's pixel dimensions from FFmpeg's "Video: ... WxH" stderr line.
// Returns {w:0,h:0} if it can't be determined (callers should treat that as
// "dimensions unknown" and skip anything that depends on them).
export function getMediaDimensions(filePath: string, timeoutMs = 30_000): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const proc = spawnFfmpeg(ffmpegBin!, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
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
    const proc = spawnFfmpeg(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
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
    const proc = spawnFfmpeg(ffmpegBin!, [
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

// ── Silence detection (editor: "Remove silences") ─────────────────────────

export interface Silence { start: number; end: number }

/**
 * Pulls silence spans out of ffmpeg's silencedetect log. Times in the log are
 * relative to where reading started (`-ss`), so `offset` puts them back into
 * source time. A silence still open at the end of the input is closed at
 * `totalSec`.
 */
export function parseSilenceLog(log: string, offset: number, totalSec: number): Silence[] {
  const out: Silence[] = [];
  let open: number | null = null;
  for (const m of log.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
    const t = Math.max(0, parseFloat(m[2]));
    if (m[1] === "start") open = t;
    else if (open !== null) { out.push({ start: offset + open, end: offset + t }); open = null; }
  }
  if (open !== null && totalSec > open) out.push({ start: offset + open, end: offset + totalSec });
  return out;
}

/** Silences (source seconds) in [startSec, startSec + durationSec] of a media file or URL. */
export function detectSilences(
  input: string,
  opts: { startSec: number; durationSec: number; noiseDb?: number; minSilenceSec?: number },
  timeoutMs = 120_000,
): Promise<Silence[]> {
  const noise = opts.noiseDb ?? -35;
  const min = opts.minSilenceSec ?? 0.6;
  return new Promise((resolve, reject) => {
    const proc = spawnFfmpeg(ffmpegBin!, [
      "-hide_banner", "-nostats",
      "-ss", String(Math.max(0, opts.startSec)),
      "-t", String(Math.max(0.1, opts.durationSec)),
      "-i", input,
      "-vn", "-af", `silencedetect=noise=${noise}dB:d=${min}`,
      "-f", "null", "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let buf = "";
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => reject(new Error("silence detection timed out")));
    proc.stderr.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
    proc.on("close", (code) => {
      clearWatchdog();
      if (code !== 0 && !/silence_/.test(buf)) { reject(new Error(`ffmpeg exited ${code}`)); return; }
      resolve(parseSilenceLog(buf, opts.startSec, opts.durationSec));
    });
    proc.on("error", (err) => { clearWatchdog(); reject(err); });
  });
}

// ── Colour stats (editor: "Match colours") ───────────────────────────────

export interface FrameColorStats { y: number; spread: number; sat: number; u: number; v: number }

/** Per-frame stats out of a `signalstats,metadata=mode=print` log. */
export function parseSignalStatsLog(log: string): FrameColorStats[] {
  const col = (key: string) => [...log.matchAll(new RegExp(`signalstats[.]${key}=(-?[0-9.]+)`, "g"))].map((m) => parseFloat(m[1]));
  const y = col("YAVG"), lo = col("YLOW"), hi = col("YHIGH"), sat = col("SATAVG"), u = col("UAVG"), v = col("VAVG");
  const n = Math.min(y.length, lo.length, hi.length, sat.length, u.length, v.length);
  const out: FrameColorStats[] = [];
  for (let i = 0; i < n; i++) out.push({ y: y[i], spread: hi[i] - lo[i], sat: sat[i], u: u[i], v: v[i] });
  return out;
}

/**
 * Colour stats of [startSec, startSec + durationSec] of a video, sampled at
 * 2 fps on a small copy, after `look` (ffmpeg filters, e.g. the clip's filter
 * preset and fine-tune) — so the numbers describe what the viewer sees.
 */
export function measureColorStats(
  input: string,
  opts: { startSec: number; durationSec: number; look?: string[] },
  timeoutMs = 120_000,
): Promise<FrameColorStats[]> {
  const vf = ["fps=2", "scale=320:-2", ...(opts.look ?? []), "signalstats", "metadata=mode=print"].join(",");
  return new Promise((resolve, reject) => {
    const proc = spawnFfmpeg(ffmpegBin!, [
      "-hide_banner", "-nostats",
      "-ss", String(Math.max(0, opts.startSec)),
      "-t", String(Math.max(0.5, opts.durationSec)),
      "-i", input,
      "-an", "-vf", vf,
      "-f", "null", "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let buf = "";
    const clearWatchdog = killAfterTimeout(proc, timeoutMs, () => reject(new Error("colour measurement timed out")));
    proc.stderr.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
    proc.on("close", (code) => {
      clearWatchdog();
      const frames = parseSignalStatsLog(buf);
      if (code !== 0 && frames.length === 0) { reject(new Error(`ffmpeg exited ${code}`)); return; }
      resolve(frames);
    });
    proc.on("error", (err) => { clearWatchdog(); reject(err); });
  });
}
