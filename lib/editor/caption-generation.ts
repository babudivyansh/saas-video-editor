// Pure caption-generation math — no fetch/DOM, unit-testable in isolation.
// The network orchestration (calling /api/editor/captions per unique asset)
// lives in the Caption panel's GenerateSection.tsx, which is the only piece
// that actually needs to be a component (it needs fetch()).

import type { CaptionClip, TimelineDoc, VideoClip } from "./types";

export interface RawWordTiming {
  word: string;
  start: number; // ms, source-time (matches /api/editor/captions' WordTiming response)
  end: number;
}

/** Groups doc.tracks.video by unique assetId, in first-seen timeline order,
 *  so the caller transcribes each unique asset exactly once regardless of
 *  how many clips (trims/splits) reuse it. */
export function planCaptionGeneration(doc: TimelineDoc): { assetId: string; clips: VideoClip[] }[] {
  const order: string[] = [];
  const byAsset = new Map<string, VideoClip[]>();
  for (const clip of doc.tracks.video) {
    if (!byAsset.has(clip.assetId)) {
      byAsset.set(clip.assetId, []);
      order.push(clip.assetId);
    }
    byAsset.get(clip.assetId)!.push(clip);
  }
  return order.map((assetId) => ({ assetId, clips: byAsset.get(assetId)! }));
}

const CAPTION_WORDS_PER_LINE = 4;

const DEFAULT_CAPTION_STYLE: Partial<CaptionClip> = {
  fontFamily: "Arial",
  fontSizePct: 0.04,
  color: "#ffffff",
  bold: true,
  bgColor: "#000000",
  x: 0.5,
  y: 0.85,
  highlightMode: "karaoke",
};

/** Generalizes the editor's previous per-clip word-to-caption grouping
 *  (formerly wordsToCaptionClips in VideoClipProps.tsx) to emit CaptionClip
 *  instead of TextClip, and — unlike that function — PRESERVES each cue's
 *  words[] (re-baselined to the cue's own timelineStart, clip-relative ms)
 *  instead of discarding per-word timing once grouped, so karaoke has real
 *  data to drive. Same srcIn/speed-aware time math as before, but with the
 *  unit conversion that function was actually missing: `words[]` timestamps
 *  are MILLISECONDS (the real /api/editor/captions response shape), while
 *  clip.srcIn/duration/timelineStart are SECONDS — the original function's
 *  own doc comment claimed "source-time seconds" but never converted either
 *  side, so it silently produced near-empty/garbage results for any real
 *  video (only words starting in the clip's first few milliseconds could
 *  ever pass its filter). All clip-scale math here happens in milliseconds
 *  internally and is converted back to seconds only for the final
 *  timelineStart/duration output. */
export function wordsToCaptionCues(words: RawWordTiming[], clip: VideoClip, style: Partial<CaptionClip> = {}): CaptionClip[] {
  const speed = clip.speed ?? 1;
  const srcInMs = clip.srcIn * 1000;
  const srcOutMs = srcInMs + clip.duration * speed * 1000;
  const inWindow = words.filter((w) => w.end > srcInMs && w.start < srcOutMs);
  const cues: CaptionClip[] = [];

  for (let i = 0; i < inWindow.length; i += CAPTION_WORDS_PER_LINE) {
    const group = inWindow.slice(i, i + CAPTION_WORDS_PER_LINE);
    const srcStartMs = Math.max(group[0].start, srcInMs);
    const srcEndMs = Math.min(group[group.length - 1].end, srcOutMs);
    const timelineStart = clip.timelineStart + (srcStartMs - srcInMs) / speed / 1000;
    const duration = Math.max((srcEndMs - srcStartMs) / speed / 1000, 0.2);
    const durationMs = duration * 1000;

    const cueWords = group.map((w) => ({
      word: w.word,
      startMs: Math.max(0, Math.min(durationMs, (w.start - srcStartMs) / speed)),
      endMs: Math.max(0, Math.min(durationMs, (w.end - srcStartMs) / speed)),
    }));

    cues.push({
      type: "caption",
      id: crypto.randomUUID(),
      timelineStart,
      duration,
      text: group.map((w) => w.word).join(" "),
      words: cueWords,
      ...DEFAULT_CAPTION_STYLE,
      ...style,
    } as CaptionClip);
  }
  return cues;
}
