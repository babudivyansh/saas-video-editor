// The inline "lite editor": speed, music bed, transitions and B-roll swap
// applied to a single already-rendered clip.
//
// These extend the AutoClip render path rather than converting the clip to the
// editor's TimelineDoc. A TimelineDoc has no concept of crop keyframes, so
// converting would make the lite editor's first act "throw away the speaker
// tracking" — the feature users came for — and would fork caption styling into
// two systems that must stay pixel-identical and won't.

import { z } from "zod";
import { SPEED_OPTIONS, TRANSITION_PRESETS } from "@/lib/editor/types";
import type { WordTiming } from "@/utils/elevenlabs";

const transitionNames = Object.keys(TRANSITION_PRESETS) as [string, ...string[]];

export const liteEditsSchema = z.object({
  v: z.literal(1).default(1),
  /** Playback rate. Constrained to the editor's own option list so the two
   *  surfaces can't drift apart on what's supported. */
  speed: z.number().refine((n) => (SPEED_OPTIONS as readonly number[]).includes(n), {
    message: "unsupported speed",
  }).optional(),
  music: z.object({
    url: z.string().url(),
    title: z.string().max(200).optional(),
    /** Jamendo requires attribution to be shown; carried so the UI can. */
    attribution: z.string().max(300).optional(),
    volume: z.number().min(0).max(1).default(0.18),
    startSec: z.number().min(0).max(24 * 3600).default(0),
    /** Duck the bed under speech (lib/audio-ducking.ts). */
    duck: z.boolean().default(true),
  }).strict().optional(),
  transition: z.object({
    brollIn: z.enum(transitionNames).optional(),
    brollOut: z.enum(transitionNames).optional(),
    /** Fade from/to black at the clip edges. */
    fadeInSec: z.number().min(0).max(2).optional(),
    fadeOutSec: z.number().min(0).max(2).optional(),
  }).strict().optional(),
  broll: z.object({
    url: z.string().url(),
    startSec: z.number().min(0).max(3600),
    endSec: z.number().min(0).max(3600),
    source: z.enum(["pexels", "generated", "upload"]).default("pexels"),
  }).strict().refine((b) => b.endSec > b.startSec, { message: "B-roll end must follow its start" }).optional(),
}).strict();

export type LiteEdits = z.infer<typeof liteEditsSchema>;

export function parseLiteEdits(value: unknown): LiteEdits | null {
  if (!value) return null;
  const parsed = liteEditsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ── The lite-edit pass ──────────────────────────────────────────────────────
//
// Speed, fades and the music bed are applied to the ALREADY-RENDERED clip
// rather than being threaded through the main filtergraph.
//
// That ordering is the whole design. By this point captions are burned in and
// the crop/zoom path is baked into the pixels, so changing playback rate
// rescales them automatically and exactly — there is no set of time-indexed
// artifacts left to keep in sync, and therefore no way for captions to drift
// against audio. Building speed into the main graph would instead require
// rescaling word timings, crop keyframes, the B-roll window and the signal
// track in lockstep across three filtergraph branches, which is the failure
// mode this avoids entirely. The price is one extra encode, only on clips that
// actually use the lite editor.

/**
 * Video-side speed change. `setpts` scales presentation timestamps; audio needs
 * atempo separately, which is why the editor's atempoChain exists (a single
 * atempo only spans 0.5x-2x, so larger changes chain several).
 */
export function speedVideoFilter(speed: number): string | null {
  if (!Number.isFinite(speed) || speed <= 0 || speed === 1) return null;
  return `setpts=${(1 / speed).toFixed(6)}*PTS`;
}

/**
 * Fade in/out at the clip edges. Applied last so it covers captions and the
 * watermark too — a fade that leaves captions legible over black reads as a bug.
 */
export function fadeFilters(fadeInSec: number | undefined, fadeOutSec: number | undefined, durationSec: number): string[] {
  const out: string[] = [];
  if (fadeInSec && fadeInSec > 0) out.push(`fade=t=in:st=0:d=${fadeInSec.toFixed(3)}`);
  if (fadeOutSec && fadeOutSec > 0 && durationSec > fadeOutSec) {
    out.push(`fade=t=out:st=${(durationSec - fadeOutSec).toFixed(3)}:d=${fadeOutSec.toFixed(3)}`);
  }
  return out;
}

export interface LitePassPlan {
  /** Whether anything needs doing at all. */
  needed: boolean;
  /** Extra ffmpeg inputs (the music file), in order after the clip itself. */
  extraInputs: string[];
  filterComplex: string;
  /** Output stream labels to map. */
  videoMap: string;
  audioMap: string;
  /** Duration after the pass, for the DB row. */
  durationSec: number;
}

/**
 * Plan the lite-edit pass over a rendered clip.
 *
 * Kept pure and separate from execution so the graph can be unit-tested
 * without ffmpeg, the same way lib/editor/filtergraph.ts is.
 */
export function planLitePass(
  lite: LiteEdits | null,
  durationSec: number,
  opts: { musicPath?: string | null; duckExpr?: string | null } = {},
): LitePassPlan {
  const speed = lite?.speed ?? 1;
  const fades = fadeFilters(lite?.transition?.fadeInSec, lite?.transition?.fadeOutSec, durationSec / speed);
  const music = lite?.music && opts.musicPath ? lite.music : null;

  if (speed === 1 && fades.length === 0 && !music) {
    return { needed: false, extraInputs: [], filterComplex: "", videoMap: "", audioMap: "", durationSec };
  }

  const vFilters = [speedVideoFilter(speed), ...fades].filter((f): f is string => !!f);
  const aFilters = speed !== 1 ? [atempoChainFor(speed)] : [];

  const parts: string[] = [];
  parts.push(`[0:v]${vFilters.length > 0 ? vFilters.join(",") : "null"}[vout]`);

  const voiceLabel = "[aspeed]";
  parts.push(`[0:a]${aFilters.length > 0 ? aFilters.join(",") : "anull"}${voiceLabel}`);

  let audioMap = voiceLabel;
  if (music) {
    // Ducking makes the bed follow the speech instead of sitting at one flat
    // level under it — the difference between "music playing" and "scored".
    const gain = opts.duckExpr ? `volume='${opts.duckExpr}':eval=frame` : `volume=${music.volume}`;
    parts.push(
      `[1:a]atrim=start=${music.startSec},asetpts=PTS-STARTPTS,aloop=loop=-1:size=2e9,${gain}[bgm]`,
    );
    // duration=first keeps the clip's own length authoritative: a longer music
    // track must never extend the video.
    parts.push(`${voiceLabel}[bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    audioMap = "[aout]";
  }

  return {
    needed: true,
    extraInputs: music && opts.musicPath ? [opts.musicPath] : [],
    filterComplex: parts.join(";"),
    videoMap: "[vout]",
    audioMap,
    durationSec: durationSec / speed,
  };
}

/**
 * atempo only accepts 0.5-2.0, so anything outside that range is expressed as
 * a chain. Mirrors lib/editor/filtergraph.ts's atempoChain; duplicated rather
 * than imported because that module pulls in the whole editor doc model.
 */
export function atempoChainFor(speed: number): string {
  if (speed === 1) return "anull";
  const steps: number[] = [];
  let remaining = speed;
  while (remaining > 2) { steps.push(2); remaining /= 2; }
  while (remaining < 0.5) { steps.push(0.5); remaining /= 0.5; }
  steps.push(remaining);
  return steps.map((s) => `atempo=${s.toFixed(6)}`).join(",");
}

/** Contiguous spans where someone is speaking, from word timings. */
export function speechRangesFromWords(words: WordTiming[], gapSec = 0.35): { start: number; end: number }[] {
  if (words.length === 0) return [];
  const ranges: { start: number; end: number }[] = [];
  let start = words[0].start / 1000;
  let end = words[0].end / 1000;
  for (const w of words.slice(1)) {
    const s = w.start / 1000;
    if (s - end > gapSec) {
      ranges.push({ start, end });
      start = s;
    }
    end = Math.max(end, w.end / 1000);
  }
  ranges.push({ start, end });
  return ranges;
}
