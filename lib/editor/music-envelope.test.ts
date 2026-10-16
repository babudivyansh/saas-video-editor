import { describe, expect, it } from "vitest";
import { DEFAULT_DOC, type AudioClip, type CaptionClip, type TimelineDoc } from "./types";
import { clipDuckSegments, musicGainAt, musicVolumeFilter, speechRangesFromCaptions } from "./music-envelope";

const music = (over: Partial<AudioClip> = {}): AudioClip => ({ id: "m", type: "audio", assetId: "a", srcIn: 0, timelineStart: 0, duration: 20, volume: 0.8, ...over });
const caption = (start: number, words: [number, number][]): CaptionClip => ({
  id: `c${start}`, type: "caption", text: "x", timelineStart: start, duration: 5, fontFamily: "Inter" as CaptionClip["fontFamily"], fontSizePct: 0.05,
  color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.8, highlightMode: "word", words: words.map(([s, e]) => ({ word: "w", startMs: s, endMs: e })),
});
const doc = (caption: CaptionClip[]): TimelineDoc => ({ ...structuredClone(DEFAULT_DOC), tracks: { ...structuredClone(DEFAULT_DOC).tracks, caption } });

describe("speechRangesFromCaptions", () => {
  it("turns word timings into timeline spans", () => {
    expect(speechRangesFromCaptions(doc([caption(2, [[0, 500], [600, 1000]])]))).toEqual([{ start: 2, end: 2.5 }, { start: 2.6, end: 3 }]);
  });
});

describe("music envelope", () => {
  const speech = [{ start: 5, end: 8 }];

  it("does nothing when ducking is off", () => {
    expect(clipDuckSegments(music(), speech)).toEqual([]);
    expect(musicGainAt(music(), 6, [])).toBeCloseTo(0.8);
  });

  it("dips under speech by the duck level", () => {
    const clip = music({ duck: true, duckLevel: 0.25 });
    const segs = clipDuckSegments(clip, speech);
    expect(musicGainAt(clip, 6, segs)).toBeCloseTo(0.2);
    expect(musicGainAt(clip, 1, segs)).toBeCloseTo(0.8);
  });

  it("works in clip-local time for a clip that starts later", () => {
    const clip = music({ timelineStart: 4, duck: true });
    const segs = clipDuckSegments(clip, speech);
    expect(segs.find((s) => s.gain < 1)?.start).toBeCloseTo(0.75); // 5 - 4 - 0.25 attack
  });

  it("fades in and out", () => {
    const clip = music({ fadeIn: 2, fadeOut: 4, volume: 1 });
    expect(musicGainAt(clip, 1, [])).toBeCloseTo(0.5);
    expect(musicGainAt(clip, 18, [])).toBeCloseTo(0.5);
    expect(musicGainAt(clip, 25, [])).toBe(0);
  });

  it("builds the matching ffmpeg filter chain", () => {
    const clip = music({ duck: true, fadeIn: 1, fadeOut: 2 });
    const f = musicVolumeFilter(clip, clipDuckSegments(clip, speech));
    expect(f).toMatch(/^volume=0\.8,volume='if\(between\(t,/);
    expect(f).toMatch(/:eval=frame,afade=t=in:st=0:d=1,afade=t=out:st=18:d=2$/);
  });
});
