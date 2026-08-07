// Per-clip signal track: the primitive the cinematic layer is built on.
//
// Before this, audio was measured exactly once — globally, after render —
// producing three scalars (mean volume, max volume, silence seconds) used only
// for scoring. Nothing in the pipeline knew, at any given moment, how loud or
// fast or emphatic the speech was, so "energy-reactive zoom" had nothing to
// react to and the zoom was necessarily arbitrary.
//
// This computes a time-series of those signals during the pick job, when the
// audio has already been extracted, and normalises each one PER CLIP. That
// last part matters: absolute dB is meaningless across sources (a podcast
// mastered at -14 LUFS and a phone recording are not comparable), so every
// signal is expressed relative to that clip's own distribution.

import { spawn } from "child_process";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";
import type { WordTiming } from "@/utils/elevenlabs";
import os from "os";
import path from "path";
import fs from "fs";

/** Samples per second of the envelope. 20Hz = one sample per 50ms. */
export const SIGNAL_HZ = 20;
const PCM_RATE = 16_000;

export interface SignalTrack {
  v: 1;
  hz: number;
  /** Loudness 0..1, normalised against this clip's own 95th percentile. */
  rms: number[];
  /** Pitch 0..1 relative to this clip's voiced range; -1 where unvoiced. */
  pitch: number[];
  /** Combined intensity envelope, 0..1 — what the camera and captions react to. */
  energy: number[];
  /** Shot-boundary times in seconds (clip-relative). */
  scenes: number[];
  /** Silence gaps, from word timings. Zoom onsets snap to these. */
  pauses: { start: number; end: number }[];
  wordsPerSec: number;
  /** Indices into the clip's word list that the LLM marked as emphatic. */
  emphasis: number[];
}

export const EMPTY_SIGNAL_TRACK: SignalTrack = {
  v: 1, hz: SIGNAL_HZ, rms: [], pitch: [], energy: [], scenes: [], pauses: [], wordsPerSec: 0, emphasis: [],
};

// ── Audio decode ────────────────────────────────────────────────────────────

/**
 * Decode a window of audio to mono 16kHz signed 16-bit PCM, in memory.
 * An omitted (or non-finite) `endSec` decodes to the end of the file.
 */
function decodePcm(mediaPath: string, startSec = 0, endSec?: number): Promise<Int16Array> {
  return new Promise((resolve) => {
    const proc = spawn(
      process.platform === "win32"
        ? path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
        : path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
      [
        "-v", "error",
        "-ss", String(startSec),
        ...(Number.isFinite(endSec) ? ["-to", String(endSec)] : []),
        "-i", mediaPath,
        "-vn", "-ac", "1", "-ar", String(PCM_RATE), "-f", "s16le", "-",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    const done = () => {
      const buf = Buffer.concat(chunks);
      // Buffer may not be 2-byte aligned if ffmpeg was cut off mid-sample.
      const usable = buf.length - (buf.length % 2);
      const out = new Int16Array(usable / 2);
      for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
      resolve(out);
    };
    proc.on("close", done);
    proc.on("error", () => resolve(new Int16Array(0)));
  });
}

// ── Signal extraction ───────────────────────────────────────────────────────

/** Root-mean-square amplitude per window. */
export function rmsEnvelope(pcm: Int16Array, windowSamples: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + windowSamples <= pcm.length; i += windowSamples) {
    let sum = 0;
    for (let j = i; j < i + windowSamples; j++) sum += pcm[j] * pcm[j];
    out.push(Math.sqrt(sum / windowSamples) / 32768);
  }
  return out;
}

/**
 * Fundamental frequency per window by autocorrelation (a simplified YIN).
 *
 * Returns Hz, or 0 where the window is unvoiced. This is deliberately a cheap
 * estimator: it feeds a smoothed 0..1 envelope for expressiveness, not a
 * musical transcription, so octave errors on a handful of windows wash out.
 */
export function pitchEnvelope(pcm: Int16Array, windowSamples: number, sampleRate = PCM_RATE): number[] {
  const MIN_HZ = 70, MAX_HZ = 400;
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.floor(sampleRate / MIN_HZ);
  const out: number[] = [];

  for (let i = 0; i + windowSamples <= pcm.length; i += windowSamples) {
    let energy = 0;
    for (let j = i; j < i + windowSamples; j++) energy += pcm[j] * pcm[j];
    // Silence has no pitch; attempting to find one produces noise.
    if (Math.sqrt(energy / windowSamples) / 32768 < 0.01) { out.push(0); continue; }

    let bestLag = 0, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag && lag < windowSamples; lag++) {
      let corr = 0;
      for (let j = i; j < i + windowSamples - lag; j++) corr += pcm[j] * pcm[j + lag];
      const norm = corr / (windowSamples - lag);
      if (norm > bestCorr) { bestCorr = norm; bestLag = lag; }
    }
    // Require the periodic component to be a meaningful share of total energy,
    // otherwise unvoiced fricatives register as low pitch.
    const threshold = (energy / windowSamples) * 0.3;
    out.push(bestLag > 0 && bestCorr > threshold ? sampleRate / bestLag : 0);
  }
  return out;
}

/** Scale to 0..1 against a high percentile, so one loud transient can't flatten everything else. */
export function normalise(values: number[], percentile = 0.95): number[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return values.map(() => 0);
  const ref = positive[Math.min(positive.length - 1, Math.floor(positive.length * percentile))];
  if (ref <= 0) return values.map(() => 0);
  return values.map((v) => Math.max(0, Math.min(1, v / ref)));
}

/** Relative pitch: 0..1 across this clip's own voiced range, -1 where unvoiced. */
export function normalisePitch(hz: number[]): number[] {
  const voiced = hz.filter((v) => v > 0).sort((a, b) => a - b);
  if (voiced.length < 4) return hz.map(() => -1);
  const lo = voiced[Math.floor(voiced.length * 0.1)];
  const hi = voiced[Math.floor(voiced.length * 0.9)];
  const span = Math.max(1, hi - lo);
  return hz.map((v) => (v <= 0 ? -1 : Math.max(0, Math.min(1, (v - lo) / span))));
}

// ── Scene detection ─────────────────────────────────────────────────────────

/**
 * Shot-boundary times via ffmpeg's scene score. Nothing in the repo did this
 * before, which is why camera moves could start mid-shot and read as glitches.
 */
export async function detectScenes(videoPath: string, startSec: number, endSec: number, threshold = 0.4): Promise<number[]> {
  const logPath = path.join(os.tmpdir(), `scenes-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  try {
    await runFFmpegArgs([
      "-v", "info", "-ss", String(startSec), "-to", String(endSec), "-i", videoPath,
      "-vf", `select='gt(scene,${threshold})',metadata=print:file=${logPath.replace(/\\/g, "/")}`,
      "-an", "-f", "null", "-",
    ], 120_000);
    if (!fs.existsSync(logPath)) return [];
    const text = fs.readFileSync(logPath, "utf8");
    return [...text.matchAll(/pts_time:([\d.]+)/g)].map((m) => parseFloat(m[1])).filter((t) => Number.isFinite(t));
  } catch (err) {
    logger.warn("signal-track", "scene detection failed, continuing without shot boundaries", err);
    return [];
  } finally {
    try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch {}
  }
}

// ── Assembly ────────────────────────────────────────────────────────────────

/** Gaps between words, in clip-relative seconds. Camera moves snap to these. */
export function pauseMap(words: WordTiming[], minGapMs = 150): { start: number; end: number }[] {
  const pauses: { start: number; end: number }[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap >= minGapMs) pauses.push({ start: words[i].end / 1000, end: words[i + 1].start / 1000 });
  }
  return pauses;
}

export interface EnergyWeights { rms: number; pitch: number; rate: number; emphasis: number }
export const DEFAULT_ENERGY_WEIGHTS: EnergyWeights = { rms: 0.5, pitch: 0.2, rate: 0.15, emphasis: 0.15 };

/**
 * One scalar intensity envelope driving zoom, caption animation and grade
 * together.
 *
 * Combining them is the point. When each effect reacts to its own signal
 * independently the result reads as amateur — captions pop while the camera
 * sits still, or the camera pushes in on a quiet aside. A single envelope keeps
 * every reaction in agreement about where the emphasis is.
 */
export function buildEnergyEnvelope(
  rms: number[],
  pitch: number[],
  words: WordTiming[],
  emphasis: number[],
  weights: EnergyWeights = DEFAULT_ENERGY_WEIGHTS,
): number[] {
  const n = rms.length;
  if (n === 0) return [];

  // Local speaking rate, sampled onto the same grid.
  const rate = new Array<number>(n).fill(0);
  const windowSec = 2;
  for (let i = 0; i < n; i++) {
    const t = i / SIGNAL_HZ;
    const from = (t - windowSec / 2) * 1000, to = (t + windowSec / 2) * 1000;
    const count = words.filter((w) => w.start >= from && w.start < to).length;
    // 3.5 words/sec is about the top of natural conversational pace.
    rate[i] = Math.min(1, count / windowSec / 3.5);
  }

  // Emphasis is a per-word flag; spread it over that word's span plus a short
  // tail so the reaction doesn't end abruptly mid-syllable.
  const emph = new Array<number>(n).fill(0);
  for (const idx of emphasis) {
    const w = words[idx];
    if (!w) continue;
    const from = Math.floor((w.start / 1000) * SIGNAL_HZ);
    const to = Math.ceil((w.end / 1000 + 0.25) * SIGNAL_HZ);
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) emph[i] = 1;
  }

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = pitch[i] < 0 ? 0 : pitch[i];
    out[i] = Math.max(0, Math.min(1,
      rms[i] * weights.rms + p * weights.pitch + rate[i] * weights.rate + emph[i] * weights.emphasis,
    ));
  }

  // Light smoothing: the raw envelope is jittery at 50ms, and a camera that
  // tracks every syllable is exactly the "distracting" failure mode.
  return smooth(out, Math.round(SIGNAL_HZ * 0.25));
}

function smooth(values: number[], halfWindow: number): number[] {
  if (halfWindow <= 0) return values;
  return values.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(values.length - 1, i + halfWindow); j++) {
      sum += values[j]; count++;
    }
    return sum / count;
  });
}

/**
 * Build the full signal track for one clip window of a source video.
 * Never throws — a missing track means the cinematic layer falls back to its
 * non-reactive behaviour, which is a downgrade, not a failure.
 */
export async function buildSignalTrack(
  videoPath: string,
  startSec: number,
  endSec: number,
  words: WordTiming[],
  emphasis: number[] = [],
): Promise<SignalTrack> {
  try {
    const durationSec = Math.max(0, endSec - startSec);
    if (durationSec <= 0) return EMPTY_SIGNAL_TRACK;

    const windowSamples = Math.round(PCM_RATE / SIGNAL_HZ);
    // One decode serves both loudness and pitch.
    const pcm = await decodePcm(videoPath, startSec, endSec);

    const rms = normalise(rmsEnvelope(pcm, windowSamples));
    const pitch = normalisePitch(pitchEnvelope(pcm, windowSamples));
    const scenes = await detectScenes(videoPath, startSec, endSec);
    const pauses = pauseMap(words);
    const energy = buildEnergyEnvelope(rms, pitch, words, emphasis);

    return {
      v: 1,
      hz: SIGNAL_HZ,
      rms: round3(rms),
      pitch: round3(pitch),
      energy: round3(energy),
      scenes: scenes.map((s) => Math.round(s * 100) / 100),
      pauses,
      wordsPerSec: durationSec > 0 ? words.length / durationSec : 0,
      emphasis,
    };
  } catch (err) {
    logger.warn("signal-track", "failed to build signal track", err);
    return EMPTY_SIGNAL_TRACK;
  }
}

function round3(values: number[]): number[] {
  return values.map((v) => Math.round(v * 1000) / 1000);
}

/**
 * Downsampled waveform peaks for the editor scrubber.
 *
 * Generated server-side, once, during render — the alternative is decoding
 * audio in the browser, and a multi-hour source would hang the tab. ~300
 * buckets is enough to draw a recognisable waveform at any drawer width.
 */
export async function computeAudioPeaks(mediaPath: string, buckets = 300): Promise<number[]> {
  try {
    const pcm = await decodePcm(mediaPath);
    if (pcm.length === 0) return [];
    const per = Math.max(1, Math.floor(pcm.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i + per <= pcm.length && peaks.length < buckets; i += per) {
      let peak = 0;
      for (let j = i; j < i + per; j++) {
        const v = Math.abs(pcm[j]);
        if (v > peak) peak = v;
      }
      peaks.push(Math.round((peak / 32768) * 1000) / 1000);
    }
    return peaks;
  } catch {
    return [];
  }
}

/** Sample an envelope at a time in seconds, with linear interpolation. */
export function sampleAt(envelope: number[], tSec: number, hz = SIGNAL_HZ): number {
  if (envelope.length === 0) return 0;
  const pos = tSec * hz;
  const i = Math.floor(pos);
  if (i < 0) return envelope[0];
  if (i >= envelope.length - 1) return envelope[envelope.length - 1];
  return envelope[i] + (envelope[i + 1] - envelope[i]) * (pos - i);
}
