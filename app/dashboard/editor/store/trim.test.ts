import { describe, expect, it } from "vitest";
import type { CaptionClip, TextClip, VideoClip } from "@/lib/editor/types";
import { validateDoc, DEFAULT_DOC } from "@/lib/editor/types";
import { constrainTiming, repairOverlaps, trimPatch } from "./trim";

const vid = (id: string, timelineStart: number, duration: number, srcIn = 0, speed?: number): VideoClip => ({
  type: "video", id, assetId: "a1", timelineStart, duration, srcIn, volume: 1, muted: false, ...(speed ? { speed } : {}),
});

const cap = (id: string, timelineStart: number, duration: number, words?: CaptionClip["words"]): CaptionClip =>
  ({ type: "caption", id, timelineStart, duration, text: words?.map((w) => w.word).join(" ") ?? "hi", words }) as CaptionClip;

describe("trimPatch — video", () => {
  const a = vid("a", 0, 5, 2);
  const b = vid("b", 5, 5);
  const list = [a, b];

  it("stops a right trim at the next clip instead of overlapping it", () => {
    expect(trimPatch("video", a, list, "right", 8)).toEqual({ duration: 5 });
  });

  it("stops a right trim at the end of the source", () => {
    // 10 s source, srcIn 2 → at most 8 s of footage left.
    expect(trimPatch("video", b, list, "right", 30, 10)).toEqual({ duration: 10 });
    const lone = vid("c", 0, 4, 2);
    expect(trimPatch("video", lone, [lone], "right", 30, 10)).toEqual({ duration: 8 });
  });

  it("scales the source limit by speed", () => {
    const fast = vid("f", 0, 2, 0, 2);
    expect(trimPatch("video", fast, [fast], "right", 30, 10)).toEqual({ duration: 5 });
  });

  it("stops a left trim at second 0 of the source", () => {
    const c = vid("c", 20, 5, 2);
    const p = trimPatch("video", c, [c], "left", 10);
    expect(p).toMatchObject({ timelineStart: 18, duration: 7, srcIn: 0 });
  });

  it("stops a left trim at the previous clip", () => {
    const c = vid("c", 12, 5, 10);
    const p = trimPatch("video", c, [b, c], "left", 4);
    expect(p).toMatchObject({ timelineStart: 10, duration: 7, srcIn: 8 });
  });

  it("never goes below the minimum length", () => {
    expect(trimPatch("video", a, list, "right", -3).duration).toBeCloseTo(0.05);
    expect(trimPatch("video", a, list, "left", 99).duration).toBeCloseTo(0.05);
  });

  it("produces docs the exporter accepts", () => {
    const right = { ...a, ...trimPatch("video", a, list, "right", 8) } as VideoClip;
    const doc = { ...DEFAULT_DOC, tracks: { ...DEFAULT_DOC.tracks, video: [right, b] } };
    expect(validateDoc(doc)).toBeNull();
  });
});

describe("trimPatch — anchored content", () => {
  it("rebases caption words on a left trim and drops the cut ones", () => {
    const c = cap("c", 10, 3, [
      { word: "one", startMs: 0, endMs: 500 },
      { word: "two", startMs: 1000, endMs: 1500 },
      { word: "three", startMs: 2000, endMs: 2500 },
    ]);
    const p = trimPatch("caption", c, [c], "left", 11) as Partial<CaptionClip>;
    expect(p.timelineStart).toBe(11);
    expect(p.words).toEqual([
      { word: "two", startMs: 0, endMs: 500 },
      { word: "three", startMs: 1000, endMs: 1500 },
    ]);
    expect(p.text).toBe("two three");
  });

  it("keeps caption cues from overlapping", () => {
    const c1 = cap("c1", 0, 2);
    const c2 = cap("c2", 3, 2);
    expect(trimPatch("caption", c1, [c1, c2], "right", 4)).toEqual({ duration: 3 });
    expect(trimPatch("caption", c2, [c1, c2], "left", 1)).toMatchObject({ timelineStart: 2 });
  });

  it("moves text keyframes with a left trim", () => {
    const t = { type: "text", id: "t", timelineStart: 0, duration: 4, keyframes: [
      { t: 0, x: 0.5, y: 0.5, scale: 1, opacity: 1 },
      { t: 3, x: 0.2, y: 0.5, scale: 1, opacity: 1 },
    ] } as unknown as TextClip;
    const p = trimPatch("text", t, [t], "left", 1) as Partial<TextClip>;
    expect(p.keyframes).toEqual([{ t: 2, x: 0.2, y: 0.5, scale: 1, opacity: 1 }]);
  });
});

describe("constrainTiming (typed values)", () => {
  it("caps a typed duration at the next clip and the source", () => {
    const a = vid("a", 0, 5);
    const b = vid("b", 6, 5);
    expect(constrainTiming("video", a, { ...a, duration: 20 }, [a, b], 30).duration).toBe(6);
    expect(constrainTiming("video", b, { ...b, duration: 40 }, [a, b], 30).duration).toBe(30);
  });

  it("keeps srcIn inside the source", () => {
    const a = vid("a", 0, 5);
    const out = constrainTiming("video", a, { ...a, srcIn: 50 }, [a], 10) as VideoClip;
    expect(out.srcIn).toBeLessThan(10);
    expect(out.srcIn + out.duration).toBeLessThanOrEqual(10);
  });
});

describe("repairOverlaps", () => {
  it("pushes overlapping video clips apart and sorts them", () => {
    const doc = { ...DEFAULT_DOC, tracks: { ...DEFAULT_DOC.tracks, video: [vid("b", 4, 5), vid("a", 0, 6)] } };
    const fixed = repairOverlaps(doc);
    expect(fixed.tracks.video.map((c) => [c.id, c.timelineStart])).toEqual([["a", 0], ["b", 6]]);
    expect(validateDoc(fixed)).toBeNull();
  });

  it("returns the same doc when nothing overlaps", () => {
    const doc = { ...DEFAULT_DOC, tracks: { ...DEFAULT_DOC.tracks, video: [vid("a", 0, 5), vid("b", 5, 5)] } };
    expect(repairOverlaps(doc)).toBe(doc);
  });
});
