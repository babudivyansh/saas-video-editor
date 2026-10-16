import { describe, expect, it } from "vitest";
import { DEFAULT_DOC, type CaptionClip, type TextClip, type TimelineDoc, type VideoClip } from "./types";
import { findFillerWords, normalizeRanges, rippleCut } from "./ripple-cut";

let n = 0;
const id = () => `new-${++n}`;
const video = (over: Partial<VideoClip> = {}): VideoClip => ({ id: "v", type: "video", assetId: "a", srcIn: 0, timelineStart: 0, duration: 10, volume: 1, muted: false, ...over });
const caption = (over: Partial<CaptionClip> = {}): CaptionClip => ({
  id: "c", type: "caption", text: "", timelineStart: 0, duration: 3, fontFamily: "Inter" as CaptionClip["fontFamily"], fontSizePct: 0.05,
  color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.8, highlightMode: "word", ...over,
});
const text = (over: Partial<TextClip> = {}): TextClip => ({
  id: "t", type: "text", text: "Hi", timelineStart: 0, duration: 10, fontFamily: "Inter" as TextClip["fontFamily"], fontSizePct: 0.05,
  color: "#ffffff", bold: false, align: "center", x: 0.5, y: 0.2, bgColor: null, ...over,
});
const doc = (tracks: Partial<TimelineDoc["tracks"]>): TimelineDoc => ({ ...structuredClone(DEFAULT_DOC), tracks: { ...structuredClone(DEFAULT_DOC).tracks, ...tracks } });

describe("normalizeRanges", () => {
  it("sorts and merges overlapping ranges", () => {
    expect(normalizeRanges([{ start: 5, end: 6 }, { start: 1, end: 2 }, { start: 1.5, end: 3 }])).toEqual([{ start: 1, end: 3 }, { start: 5, end: 6 }]);
  });
});

describe("rippleCut", () => {
  it("splits a video clip around a cut inside it and closes the gap", () => {
    const out = rippleCut(doc({ video: [video({ speed: 2 })] }), [{ start: 4, end: 5 }], id);
    expect(out.tracks.video).toEqual([
      expect.objectContaining({ id: "v", timelineStart: 0, duration: 4, srcIn: 0 }),
      expect.objectContaining({ timelineStart: 4, duration: 5, srcIn: 10 }),
    ]);
  });

  it("slides later clips left and drops clips fully inside a cut", () => {
    const out = rippleCut(doc({ video: [video({ duration: 2 }), video({ id: "gone", timelineStart: 2, duration: 1 }), video({ id: "late", timelineStart: 3, duration: 2 })] }), [{ start: 2, end: 3 }], id);
    expect(out.tracks.video.map((c) => [c.id, c.timelineStart, c.duration])).toEqual([["v", 0, 2], ["late", 2, 2]]);
  });

  it("shortens an overlay that spans the cut instead of splitting it", () => {
    const out = rippleCut(doc({ text: [text()] }), [{ start: 2, end: 4 }], id);
    expect(out.tracks.text).toEqual([expect.objectContaining({ timelineStart: 0, duration: 8 })]);
  });

  it("removes cut words from a caption and moves the later ones earlier", () => {
    const c = caption({ timelineStart: 1, words: [{ word: "So", startMs: 0, endMs: 300 }, { word: "um", startMs: 300, endMs: 700 }, { word: "yes", startMs: 700, endMs: 1200 }] });
    const out = rippleCut(doc({ caption: [c] }), [{ start: 1.3, end: 1.7 }], id);
    expect(out.tracks.caption[0]).toMatchObject({ timelineStart: 1, duration: 2.6, text: "So yes" });
    expect(out.tracks.caption[0].words).toEqual([{ word: "So", startMs: 0, endMs: 300 }, { word: "yes", startMs: 300, endMs: 800 }]);
  });

  it("trims the head of a clip that starts inside the cut", () => {
    const out = rippleCut(doc({ video: [video({ timelineStart: 3, duration: 4, srcIn: 1 })] }), [{ start: 2, end: 4 }], id);
    expect(out.tracks.video[0]).toMatchObject({ timelineStart: 2, duration: 3, srcIn: 2 });
  });
});

describe("findFillerWords", () => {
  it("finds single and multi-word fillers with their timeline span", () => {
    const c = caption({ timelineStart: 10, words: [
      { word: "Um,", startMs: 0, endMs: 200 }, { word: "this", startMs: 200, endMs: 400 },
      { word: "you", startMs: 400, endMs: 550 }, { word: "know", startMs: 550, endMs: 700 }, { word: "works", startMs: 700, endMs: 900 },
    ] });
    expect(findFillerWords(doc({ caption: [c] }))).toEqual([
      { captionId: "c", text: "Um,", start: 10, end: 10.2 },
      { captionId: "c", text: "you know", start: 10.4, end: 10.7 },
    ]);
  });
});
