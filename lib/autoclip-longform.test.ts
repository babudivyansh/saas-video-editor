import { describe, expect, it, vi } from "vitest";

// Covers the long-form scaling work: transcript formatting for the LLM prompt,
// window splitting for map-reduce selection, keyframe simplification, and the
// face-timeline compaction that keeps a multi-hour source out of a Postgres
// JSON column.

vi.mock("@/lib/env", () => ({
  env: {
    AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b",
    GEMINI_API_KEY: "test",
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import { formatTranscriptForPrompt, splitIntoWindows } from "./autoclip-pipeline";
import { simplifyKeyframes, type CropKeyframe } from "./reframe";
import { compactTimeline } from "./face-timeline-store";
import type { FaceBox } from "./reframe";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("formatTranscriptForPrompt", () => {
  it("groups words into phrases with one timestamp each", () => {
    const out = formatTranscriptForPrompt([w("hello", 0, 300), w("there", 300, 700), w("friend", 700, 1100)]);
    expect(out).toBe("[0.0] hello there friend");
  });

  it("starts a new phrase after a long pause", () => {
    const out = formatTranscriptForPrompt([w("first", 0, 400), w("second", 2000, 2400)]);
    expect(out.split("\n")).toEqual(["[0.0] first", "[2.0] second"]);
  });

  it("caps phrase length so timestamps stay dense enough to cut on", () => {
    const words = Array.from({ length: 30 }, (_, i) => w("x", i * 100, i * 100 + 90));
    const lines = formatTranscriptForPrompt(words).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.split(" ").length - 1).toBeLessThanOrEqual(12);
  });

  // The whole point: one timestamp per word was ~200k tokens on a long source.
  it("is dramatically smaller than one timestamp per word", () => {
    const words = Array.from({ length: 2000 }, (_, i) => w("word", i * 300, i * 300 + 250));
    const perWord = words.map((x) => `[${(x.start / 1000).toFixed(2)}] ${x.word}`).join(" ");
    expect(formatTranscriptForPrompt(words).length).toBeLessThan(perWord.length / 2);
  });

  it("handles an empty transcript", () => {
    expect(formatTranscriptForPrompt([])).toBe("");
  });
});

describe("splitIntoWindows", () => {
  it("covers the whole source without overlapping", () => {
    const words = Array.from({ length: 100 }, (_, i) => w("x", i * 60_000, i * 60_000 + 500));
    const windows = splitIntoWindows(words, 100 * 60, 20 * 60);
    expect(windows.length).toBe(5);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startSec).toBe(windows[i - 1].endSec);
    }
    // Every word lands in exactly one window.
    expect(windows.reduce((s, win) => s + win.words.length, 0)).toBe(words.length);
  });

  it("drops windows with no speech in them", () => {
    const words = [w("only", 0, 500), w("here", 600, 900)];
    const windows = splitIntoWindows(words, 60 * 60, 20 * 60);
    expect(windows).toHaveLength(1);
    expect(windows[0].startSec).toBe(0);
  });
});

describe("simplifyKeyframes", () => {
  const path = (n: number, f: (i: number) => Partial<CropKeyframe>): CropKeyframe[] =>
    Array.from({ length: n }, (_, i) => ({ tSec: i * 0.1, x: 0.2, y: 0.1, w: 0.4, h: 0.9, ...f(i) }));

  it("collapses a straight line to its endpoints", () => {
    const kf = path(100, (i) => ({ x: 0.1 + (i / 100) * 0.5 }));
    expect(simplifyKeyframes(kf).length).toBeLessThanOrEqual(3);
  });

  it("preserves the shape of a path that actually changes direction", () => {
    const kf = path(100, (i) => ({ x: 0.1 + Math.sin(i / 10) * 0.3 }));
    const out = simplifyKeyframes(kf);
    expect(out.length).toBeGreaterThan(4);
    // Max deviation from the original path stays visually negligible.
    for (const orig of kf) {
      const after = out.filter((k) => k.tSec <= orig.tSec).pop() ?? out[0];
      const before = out.find((k) => k.tSec >= orig.tSec) ?? out[out.length - 1];
      const span = before.tSec - after.tSec;
      const interp = span === 0 ? after.x : after.x + (before.x - after.x) * ((orig.tSec - after.tSec) / span);
      expect(Math.abs(interp - orig.x)).toBeLessThan(0.03);
    }
  });

  it("always keeps the first and last keyframe so the path spans the clip", () => {
    const kf = path(50, (i) => ({ x: 0.1 + Math.sin(i / 3) * 0.4 }));
    const out = simplifyKeyframes(kf);
    expect(out[0].tSec).toBe(kf[0].tSec);
    expect(out[out.length - 1].tSec).toBe(kf[kf.length - 1].tSec);
  });

  it("enforces the point budget even on an erratic path", () => {
    const kf = path(600, (i) => ({ x: 0.1 + Math.sin(i) * 0.4, y: 0.1 + Math.cos(i) * 0.2 }));
    expect(simplifyKeyframes(kf).length).toBeLessThanOrEqual(40);
  });

  it("leaves a already-short path alone", () => {
    const kf = path(2, () => ({}));
    expect(simplifyKeyframes(kf)).toHaveLength(2);
  });
});

describe("compactTimeline", () => {
  const face = (tSec: number, extra: Partial<FaceBox> = {}): FaceBox => ({
    tSec, x: 0.123456, y: 0.234567, w: 0.111111, h: 0.222222, confidence: 90, ...extra,
  });

  it("thins samples to the storage rate", () => {
    // 30 samples/sec over 10s — far finer than the crop path can use.
    const faces = Array.from({ length: 300 }, (_, i) => face(i / 30));
    const out = compactTimeline(faces);
    expect(out.length).toBeLessThanOrEqual(10 * 5 + 1);
    expect(out.length).toBeGreaterThan(10);
  });

  it("keeps the highest-confidence sample in each bucket", () => {
    const faces = [face(1.00, { confidence: 70 }), face(1.05, { confidence: 99 })];
    const out = compactTimeline(faces);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(99);
  });

  it("keeps separate tracks separate", () => {
    const faces = [face(1, { trackId: "a" }), face(1, { trackId: "b" })];
    expect(compactTimeline(faces)).toHaveLength(2);
  });

  it("rounds coordinates below one pixel at 1080p", () => {
    const out = compactTimeline([face(1)]);
    // 1/1000 of a 1920px frame is under two pixels; the crop path smooths far
    // more than that, so this is lossless in practice.
    expect(out[0].x).toBe(0.123);
    expect(String(out[0].w).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("preserves the speaking score when present and omits it when absent", () => {
    expect(compactTimeline([face(1, { speaking: 0.87654 })])[0].speaking).toBe(0.877);
    expect(compactTimeline([face(1)])[0].speaking).toBeUndefined();
  });

  it("returns samples in ascending time order", () => {
    const out = compactTimeline([face(5), face(1), face(3)]);
    expect(out.map((f) => f.tSec)).toEqual([1, 3, 5]);
  });
});
