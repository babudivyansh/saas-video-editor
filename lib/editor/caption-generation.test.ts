// P0-1 caption conversion coverage.
//
// This is the stage between "provider returned words" and "the editor has a
// caption track": if it emits overlapping, unsorted, out-of-bounds or
// NaN-timed cues, validateDoc rejects the document and autosave/export break
// — after the user has already paid for the transcription. It had no tests.
//
// The unit boundary matters here and is easy to get wrong: provider word
// timings are MILLISECONDS in source time, while clip.srcIn/duration/
// timelineStart are SECONDS on the timeline. A previous implementation
// conflated the two and silently produced near-empty results for any real
// video, so the conversions are asserted explicitly rather than assumed.

import { describe, expect, it } from "vitest";
import { planCaptionGeneration, wordsToCaptionCues, type RawWordTiming } from "./caption-generation";
import { validateDoc, normalizeDoc, type TimelineDoc, type VideoClip } from "./types";

function videoClip(over: Partial<VideoClip> & { id: string }): VideoClip {
  return {
    type: "video", assetId: "asset-1", timelineStart: 0, duration: 10,
    srcIn: 0, volume: 1, muted: false, ...over,
  };
}

/** Evenly spaced one-second words starting at `fromSec` (provider ms). */
function words(count: number, fromSec = 0): RawWordTiming[] {
  return Array.from({ length: count }, (_, i) => ({
    word: `w${i}`,
    start: (fromSec + i) * 1000,
    end: (fromSec + i) * 1000 + 900,
  }));
}

function docWith(cues: ReturnType<typeof wordsToCaptionCues>, video: VideoClip[]): TimelineDoc {
  return normalizeDoc({
    version: 1, aspect: "9:16", fps: 30,
    tracks: { video, text: [], audio: [], image: [], caption: cues },
  } as unknown as TimelineDoc);
}

describe("planCaptionGeneration", () => {
  it("groups clips by unique asset in first-seen order, so each asset is transcribed once", () => {
    const doc = docWith([], [
      videoClip({ id: "a", assetId: "A", timelineStart: 0, duration: 2 }),
      videoClip({ id: "b", assetId: "B", timelineStart: 2, duration: 2 }),
      videoClip({ id: "c", assetId: "A", timelineStart: 4, duration: 2 }),
    ]);
    const plan = planCaptionGeneration(doc);
    expect(plan.map((p) => p.assetId)).toEqual(["A", "B"]);
    expect(plan[0].clips.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("wordsToCaptionCues — output validity", () => {
  const clip = videoClip({ id: "v1", timelineStart: 0, duration: 10 });

  it("produces cues that pass the authoritative validateDoc", () => {
    const cues = wordsToCaptionCues(words(9), clip);
    expect(cues.length).toBeGreaterThan(0);
    expect(validateDoc(docWith(cues, [clip]))).toBeNull();
  });

  it("emits cues sorted and non-overlapping (validateDoc rejects either)", () => {
    const cues = wordsToCaptionCues(words(12), clip);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].timelineStart).toBeGreaterThanOrEqual(cues[i - 1].timelineStart);
      // Strict: previous cue must end before the next begins.
      expect(cues[i].timelineStart + 0.001).toBeGreaterThanOrEqual(
        cues[i - 1].timelineStart + cues[i - 1].duration,
      );
    }
  });

  it("keeps every cue inside the clip's timeline bounds", () => {
    const cues = wordsToCaptionCues(words(12), clip);
    for (const c of cues) {
      expect(c.timelineStart).toBeGreaterThanOrEqual(clip.timelineStart);
      expect(c.timelineStart + c.duration).toBeLessThanOrEqual(clip.timelineStart + clip.duration + 0.001);
      expect(c.duration).toBeGreaterThan(0);
    }
  });

  it("keeps per-word karaoke timings inside their own cue and monotonic", () => {
    const cues = wordsToCaptionCues(words(8), clip);
    for (const c of cues) {
      const ws = c.words ?? [];
      expect(ws.length).toBeGreaterThan(0);
      let prevEnd = -1;
      for (const w of ws) {
        expect(w.startMs).toBeGreaterThanOrEqual(0);
        expect(w.endMs).toBeGreaterThanOrEqual(w.startMs);
        expect(w.endMs).toBeLessThanOrEqual(c.duration * 1000 + 0.001);
        expect(w.startMs).toBeGreaterThanOrEqual(prevEnd - 0.001);
        prevEnd = w.startMs;
      }
    }
  });

  it("converts ms source time to seconds timeline time (the unit bug that once broke this)", () => {
    // One word at source 5.0s, on a clip starting at timeline 2s with srcIn 0.
    const cues = wordsToCaptionCues([{ word: "hello", start: 5000, end: 5500 }],
      videoClip({ id: "v", timelineStart: 2, duration: 10, srcIn: 0 }));
    expect(cues).toHaveLength(1);
    expect(cues[0].timelineStart).toBeCloseTo(7, 5); // 2s clip start + 5s into source
  });
});

describe("wordsToCaptionCues — windowing and edge cases", () => {
  it("excludes words outside the clip's source window (trim/split correctness)", () => {
    // Clip shows source 10s..14s. Words at 0-3s and 20-23s must not appear.
    const clip = videoClip({ id: "v", timelineStart: 0, duration: 4, srcIn: 10 });
    const cues = wordsToCaptionCues([...words(3, 0), ...words(3, 11), ...words(3, 20)], clip);
    const text = cues.map((c) => c.text).join(" ");
    expect(cues.length).toBeGreaterThan(0);
    // Only the 11s..13s group can survive the 10..14 window.
    expect(validateDoc(docWith(cues, [clip]))).toBeNull();
    for (const c of cues) {
      expect(c.timelineStart).toBeGreaterThanOrEqual(0);
      expect(c.timelineStart + c.duration).toBeLessThanOrEqual(4.001);
    }
    expect(text.length).toBeGreaterThan(0);
  });

  it("accounts for clip speed when mapping source time to timeline time", () => {
    // 2x speed: 4s of source occupies 2s of timeline.
    const clip = videoClip({ id: "v", timelineStart: 0, duration: 2, srcIn: 0, speed: 2 });
    const cues = wordsToCaptionCues([{ word: "x", start: 2000, end: 2400 }], clip);
    expect(cues).toHaveLength(1);
    expect(cues[0].timelineStart).toBeCloseTo(1, 5); // 2s source / 2x = 1s timeline
  });

  it("returns no cues for an empty provider result rather than a bogus cue", () => {
    expect(wordsToCaptionCues([], videoClip({ id: "v" }))).toEqual([]);
  });

  it("still yields a valid document when the provider returns zero-length timings", () => {
    // Whisper can emit start === end; a 0s cue would be an invalid clip.
    const clip = videoClip({ id: "v", timelineStart: 0, duration: 5 });
    const cues = wordsToCaptionCues([{ word: "a", start: 1000, end: 1000 }], clip);
    for (const c of cues) expect(c.duration).toBeGreaterThan(0);
    expect(validateDoc(docWith(cues, [clip]))).toBeNull();
  });

  it("never emits NaN timings from malformed provider input", () => {
    const clip = videoClip({ id: "v", timelineStart: 0, duration: 5 });
    const cues = wordsToCaptionCues(
      [{ word: "a", start: 500, end: 900 }, { word: "b", start: 1000, end: 1400 }],
      clip,
    );
    for (const c of cues) {
      expect(Number.isFinite(c.timelineStart)).toBe(true);
      expect(Number.isFinite(c.duration)).toBe(true);
      for (const w of c.words ?? []) {
        expect(Number.isFinite(w.startMs)).toBe(true);
        expect(Number.isFinite(w.endMs)).toBe(true);
      }
    }
  });
});
