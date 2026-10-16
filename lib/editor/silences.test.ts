import { describe, expect, it } from "vitest";
import type { VideoClip } from "./types";
import { silencesToCuts } from "./silences";

const clip = (over: Partial<VideoClip> = {}): VideoClip => ({ id: "v", type: "video", assetId: "a", srcIn: 10, timelineStart: 5, duration: 20, volume: 1, muted: false, ...over });

describe("silencesToCuts", () => {
  it("maps source silences onto the timeline with padding kept", () => {
    expect(silencesToCuts(clip(), [{ start: 12, end: 14 }])).toEqual([{ start: 7.15, end: 8.85 }]);
  });

  it("clamps to the part of the source that's on the timeline", () => {
    expect(silencesToCuts(clip(), [{ start: 8, end: 11 }, { start: 29, end: 40 }])).toEqual([
      { start: 5.15, end: 5.85 },
      { start: 24.15, end: 24.85 },
    ]);
  });

  it("accounts for speed", () => {
    expect(silencesToCuts(clip({ speed: 2 }), [{ start: 14, end: 18 }], 0)).toEqual([{ start: 7, end: 9 }]);
  });

  it("skips pauses that are too short once padded", () => {
    expect(silencesToCuts(clip(), [{ start: 12, end: 12.4 }])).toEqual([]);
  });
});
