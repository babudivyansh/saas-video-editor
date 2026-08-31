// The 6 richer AutoClip-derived looks (RICH_LOOKS in captionPresets.ts) are
// hand-written style literals, not generated — a typo'd value (strokeWidthPct
// out of its 0..0.05 range, an invalid shadow) would pass TypeScript (they're
// all optional, loosely-typed numbers) but make validateDoc reject any real
// document that uses the template. This is the check that would have caught
// that class of mistake.

import { describe, expect, it } from "vitest";
import { CAPTION_TEMPLATES } from "./captionPresets";
import { wordsToCaptionCues, type RawWordTiming } from "@/lib/editor/caption-generation";
import { validateDoc, normalizeDoc, type TimelineDoc, type VideoClip } from "@/lib/editor/types";

function videoClip(over: Partial<VideoClip> & { id: string }): VideoClip {
  return { type: "video", assetId: "asset-1", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false, ...over };
}

function words(count: number): RawWordTiming[] {
  return Array.from({ length: count }, (_, i) => ({ word: `w${i}`, start: i * 1000, end: i * 1000 + 900 }));
}

describe("CAPTION_TEMPLATES — every styleOnly produces a valid document", () => {
  const clip = videoClip({ id: "v1" });

  it.each(CAPTION_TEMPLATES.map((t) => [t.label, t.styleOnly] as const))("%s", (_label, styleOnly) => {
    const cues = wordsToCaptionCues(words(4), clip, styleOnly);
    const doc: TimelineDoc = normalizeDoc({
      version: 1, aspect: "9:16", fps: 30,
      tracks: { video: [clip], text: [], audio: [], image: [], caption: cues },
    } as unknown as TimelineDoc);
    expect(validateDoc(doc)).toBeNull();
  });
});
