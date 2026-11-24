import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommitQueue, coverObjectPosition, cropAt, fmtStamp, groupTranscriptLines, mediaPath, rebaseWords, renderWaitReducer, rerenderPriceLabel,
  type CommitResult, type CropKeyframe,
} from "./clipPanelLogic";
import { previewKeyframes } from "./clipPanelLogic";

describe("cropAt", () => {
  const kf: CropKeyframe[] = [
    { tSec: 0, x: 0.1, y: 0, w: 0.3, h: 1 },
    { tSec: 2, x: 0.5, y: 0, w: 0.3, h: 1 },
  ];
  it("holds each keyframe until the next one, like the render", () => {
    expect(cropAt(kf, 0)?.x).toBe(0.1);
    expect(cropAt(kf, 1.9)?.x).toBe(0.1);
    expect(cropAt(kf, 2)?.x).toBe(0.5);
    expect(cropAt(kf, 99)?.x).toBe(0.5);
  });
  it("is null with no crop path (static centre crop)", () => {
    expect(cropAt(null, 1)).toBeNull();
    expect(cropAt([], 1)).toBeNull();
  });
});

describe("coverObjectPosition", () => {
  const wide = 16 / 9;
  const tall = 9 / 16;
  it("centres when there is no crop", () => {
    expect(coverObjectPosition(null, wide, tall)).toEqual({ x: 50, y: 50 });
  });
  it("pans a 9:16 box across a 16:9 source to the crop's centre", () => {
    // A crop flush left shows the left edge; flush right shows the right edge.
    const visible = tall / wide;
    expect(coverObjectPosition({ tSec: 0, x: 0, y: 0, w: visible, h: 1 }, wide, tall).x).toBe(0);
    expect(coverObjectPosition({ tSec: 0, x: 1 - visible, y: 0, w: visible, h: 1 }, wide, tall).x).toBe(100);
    expect(coverObjectPosition({ tSec: 0, x: (1 - visible) / 2, y: 0, w: visible, h: 1 }, wide, tall).x).toBe(50);
  });
  it("clamps a crop near the edge inside the frame", () => {
    expect(coverObjectPosition({ tSec: 0, x: -0.2, y: 0, w: 0.1, h: 1 }, wide, tall).x).toBe(0);
    expect(coverObjectPosition({ tSec: 0, x: 0.95, y: 0, w: 0.1, h: 1 }, wide, tall).x).toBe(100);
  });
  it("pans vertically when the source is the taller one", () => {
    const pos = coverObjectPosition({ tSec: 0, x: 0, y: 0, w: 1, h: 0.2 }, tall, 1);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(0);
  });
  it("needs no pan when the shapes match", () => {
    expect(coverObjectPosition({ tSec: 0, x: 0.7, y: 0, w: 0.3, h: 1 }, wide, wide)).toEqual({ x: 50, y: 50 });
  });
});

describe("mediaPath", () => {
  it("drops the signature so a re-signed URL for the same render compares equal", () => {
    expect(mediaPath("https://b.s3/renders/p/clip-a.mp4?X-Amz-Signature=1")).toBe("https://b.s3/renders/p/clip-a.mp4");
    expect(mediaPath("https://b.s3/renders/p/clip-a.mp4")).toBe("https://b.s3/renders/p/clip-a.mp4");
    expect(mediaPath(null)).toBeNull();
  });
});

describe("renderWaitReducer", () => {
  const start = renderWaitReducer({ left: 0, path: null }, { type: "clip", path: "v1", status: "ready" });

  it("learns the current file without counting it as a render", () => {
    expect(start).toEqual({ left: 0, path: "v1" });
  });
  it("waits for one new file after a change that rendered straight away", () => {
    let s = renderWaitReducer(start, { type: "committed", deferred: false });
    expect(s.left).toBe(1);
    s = renderWaitReducer(s, { type: "clip", path: "v1", status: "rendering" });
    expect(s.left).toBe(1);
    s = renderWaitReducer(s, { type: "clip", path: "v2", status: "ready" });
    expect(s.left).toBe(0);
  });
  it("waits for two when the change was queued behind a render already running", () => {
    let s = renderWaitReducer(start, { type: "committed", deferred: false });
    s = renderWaitReducer(s, { type: "committed", deferred: true });
    expect(s.left).toBe(2);
    // The first render landing is NOT the one with the newest pick.
    s = renderWaitReducer(s, { type: "clip", path: "v2", status: "ready" });
    expect(s.left).toBe(1);
    s = renderWaitReducer(s, { type: "clip", path: "v3", status: "ready" });
    expect(s.left).toBe(0);
  });
  it("stops waiting when the render fails", () => {
    const s = renderWaitReducer({ left: 2, path: "v1" }, { type: "clip", path: "v1", status: "failed" });
    expect(s.left).toBe(0);
  });
});

describe("CommitQueue", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function make() {
    const committed: CommitResult[] = [];
    const q = new CommitQueue(() => {}, (r) => committed.push(r));
    return { q, committed };
  }

  it("turns a burst of clicks into one request with the last value", async () => {
    const { q, committed } = make();
    const sent: string[] = [];
    for (const id of ["a", "b", "c"]) {
      q.schedule(async () => { sent.push(id); return { deferred: false }; }, 500);
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(sent).toEqual([]);
    expect(q.status).toBe("waiting");
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toEqual(["c"]);
    expect(committed).toEqual([{ deferred: false }]);
    expect(q.status).toBe("idle");
    expect(q.busy).toBe(false);
  });

  it("never sends two at once: a change made mid-request goes after it", async () => {
    const { q } = make();
    const order: string[] = [];
    let release!: () => void;
    q.schedule(() => new Promise<CommitResult>((res) => { order.push("a:start"); release = () => { order.push("a:end"); res({ deferred: false }); }; }), 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(q.status).toBe("saving");
    q.schedule(async () => { order.push("b"); return { deferred: true }; }, 100);
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual(["a:start"]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["a:start", "a:end", "b"]);
  });

  it("reports a failed save and keeps going with the next change", async () => {
    const { q } = make();
    q.schedule(async () => { throw new Error("Insufficient credits"); }, 10);
    await vi.advanceTimersByTimeAsync(10);
    expect(q.status).toBe("error");
    expect(q.error).toBe("Insufficient credits");
    q.schedule(async () => ({ deferred: false }), 10);
    expect(q.error).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    expect(q.status).toBe("idle");
  });

  it("flush sends a pending change at once (closing the panel right after a click)", async () => {
    const { q, committed } = make();
    q.schedule(async () => ({ deferred: false }), 10_000);
    await q.flush();
    expect(committed).toHaveLength(1);
  });
});

describe("rerenderPriceLabel", () => {
  it("is free for a clip's first re-render and when the price is 0", () => {
    expect(rerenderPriceLabel(0, 5)).toBe("free");
    expect(rerenderPriceLabel(3, 0)).toBe("free");
  });
  it("states the real price, not a hard-coded one", () => {
    expect(rerenderPriceLabel(1, 1)).toBe("1 credit");
    expect(rerenderPriceLabel(1, 2)).toBe("2 credits");
  });
  it("doesn't claim free before the price has loaded", () => {
    expect(rerenderPriceLabel(1, null)).toBe("may cost credits");
  });
});

describe("groupTranscriptLines", () => {
  const w = (word: string, start: number, end = start + 200) => ({ word, start, end });
  it("breaks after sentence punctuation", () => {
    const words = [w("Most", 0), w("die.", 250), w("They", 500), w("survive", 750)];
    expect(groupTranscriptLines(words)).toEqual([[0, 1], [2, 3]]);
  });
  it("breaks on a pause longer than 600 ms", () => {
    const words = [w("one", 0), w("two", 300), w("three", 1200)];
    expect(groupTranscriptLines(words)).toEqual([[0, 1], [2]]);
  });
  it("caps a line at eight words", () => {
    const words = Array.from({ length: 10 }, (_, i) => w(`w${i}`, i * 220));
    expect(groupTranscriptLines(words).map((l) => l.length)).toEqual([8, 2]);
  });
  it("covers every word exactly once, and handles an empty transcript", () => {
    const words = [w("a", 0), w("b.", 210), w("c", 2000)];
    expect(groupTranscriptLines(words).flat()).toEqual([0, 1, 2]);
    expect(groupTranscriptLines([])).toEqual([]);
  });
});

describe("fmtStamp", () => {
  it("formats milliseconds as m:ss.s", () => {
    expect(fmtStamp(6800)).toBe("0:06.8");
    expect(fmtStamp(74_250)).toBe("1:14.3");
    expect(fmtStamp(-5)).toBe("0:00.0");
  });
});

describe("rebaseWords", () => {
  const words = [
    { word: "a", start: 500, end: 900 },
    { word: "b", start: 2100, end: 2600, speaker: "S1" },
    { word: "c", start: 4800, end: 5400 },
  ];
  it("shifts words onto a later start, drops those cut off and clips the edge", () => {
    // Clip was 10s-16s; trimmed to 12s-15s.
    expect(rebaseWords(words, 10, 12, 15)).toEqual([
      { word: "b", start: 100, end: 600, speaker: "S1" },
      { word: "c", start: 2800, end: 3000 },
    ]);
  });
  it("leaves words alone when the window is unchanged", () => {
    expect(rebaseWords(words, 10, 10, 16)).toEqual(words);
  });
});

describe("previewKeyframes", () => {
  const kf = [{ tSec: 0, x: 0.2, y: 0, w: 0.3, h: 1 }];
  it("reads the stored single-crop shape the API returns", () => {
    expect(previewKeyframes({ mode: "single", keyframes: kf })).toEqual(kf);
  });
  it("still accepts a bare array", () => {
    expect(previewKeyframes(kf)).toEqual(kf);
  });
  it("has no path for layouts that compose the frame", () => {
    expect(previewKeyframes({ mode: "fit" })).toBeNull();
    expect(previewKeyframes({ mode: "split", a: kf, b: kf })).toBeNull();
    expect(previewKeyframes(null)).toBeNull();
  });
});
