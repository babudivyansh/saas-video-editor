// Pure caption-generation math — no fetch/DOM, unit-testable in isolation.
// The network orchestration (calling /api/editor/captions per unique asset)
// lives in the Caption panel's GenerateSection.tsx, which is the only piece
// that actually needs to be a component (it needs fetch()).

import type { CaptionClip, TimelineDoc, VideoClip } from "./timeline";
import type { CaptionWordStyle } from "../captions/style";

export interface RawWordTiming {
  word: string;
  start: number; // ms, source-time (matches /api/editor/captions' WordTiming response)
  end: number;
  /** Diarized speaker label, when the transcriber provides one. */
  speaker?: string;
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
    const srcStartMs = Math.max(group[0]!.start, srcInMs);
    const srcEndMs = Math.min(group[group.length - 1]!.end, srcOutMs);
    const timelineStart = clip.timelineStart + (srcStartMs - srcInMs) / speed / 1000;
    const duration = Math.max((srcEndMs - srcStartMs) / speed / 1000, 0.2);
    const durationMs = duration * 1000;

    const cueWords = group.map((w) => ({
      word: w.word,
      startMs: Math.max(0, Math.min(durationMs, (w.start - srcStartMs) / speed)),
      endMs: Math.max(0, Math.min(durationMs, (w.end - srcStartMs) / speed)),
      ...(w.speaker ? { speaker: w.speaker } : {}),
    }));

    cues.push({
      type: "caption",
      id: newClipId(),
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

/** A uuid for a new clip: crypto.randomUUID where the runtime has it (browsers, Node), else a v4-shaped random id (React Native's Hermes). */
export function newClipId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface TemplateCaptionWord {
  word: string;
  /** Timeline ms. */
  start: number;
  end: number;
  speaker?: string;
  style?: CaptionWordStyle;
}

export interface TemplateCaptionGroup {
  templateId: string;
  accent?: string;
  words: TemplateCaptionWord[];
}

/**
 * The editor's template-styled caption cues as one timed word list per
 * template, on the timeline clock. Shared by the preview (CaptionTemplateRender
 * at the playhead) and the export (lib/captions/engine), so they agree. A cue
 * without word timings spreads its text evenly over the cue.
 */
export function templateCaptionGroups(clips: CaptionClip[]): TemplateCaptionGroup[] {
  const groups = new Map<string, TemplateCaptionGroup>();
  const sorted = [...clips].filter((c) => c.templateId && !c.hidden).sort((a, b) => a.timelineStart - b.timelineStart);
  for (const c of sorted) {
    const key = `${c.templateId}|${c.templateAccent ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { templateId: c.templateId!, ...(c.templateAccent ? { accent: c.templateAccent } : {}), words: [] };
      groups.set(key, g);
    }
    const group = g;
    const base = c.timelineStart * 1000;
    const endMs = base + c.duration * 1000;
    if (c.words?.length) {
      for (const w of c.words) {
        if (!w.word.trim()) continue;
        group.words.push({
          word: w.word,
          start: Math.min(endMs, base + w.startMs),
          end: Math.min(endMs, base + w.endMs),
          ...(w.speaker ? { speaker: w.speaker } : {}),
          ...(w.style ? { style: w.style } : {}),
        });
      }
    } else {
      const parts = c.text.split(/\s+/).filter(Boolean);
      const step = (c.duration * 1000) / Math.max(1, parts.length);
      parts.forEach((word, i) => group.words.push({ word, start: base + i * step, end: base + (i + 1) * step }));
    }
  }
  return [...groups.values()];
}
