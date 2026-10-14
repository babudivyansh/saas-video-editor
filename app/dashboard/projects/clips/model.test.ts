import { describe, expect, it } from "vitest";
import { clipName, clipWindow, sortClips, stepClip, visibleClips, type ViewClip } from "./model";

const clip = (id: string, over: Partial<ViewClip> = {}): ViewClip =>
  ({
    id, projectId: "p1", projectTitle: "P", index: 0, title: id, startSec: 0, endSec: 30, durationSec: 30,
    aspectRatio: "9:16", score: 50, scoreBreakdown: null, mood: null, status: "ready", progress: 100,
    videoUrl: "v.mp4", thumbnailUrl: null, hasCaptions: false, captionStyleIndex: null, brollQuery: null,
    subtitleStyleOverride: null, silenceSettings: null, liteEdits: null, audioPeaks: null, rerenderCount: 0,
    isFavorite: false, isDisliked: false, dubbed: false, edited: false, ...over,
  }) as ViewClip;

describe("sortClips", () => {
  const list = [
    clip("a", { score: 80, index: 2, durationSec: 10, startSec: 50 }),
    clip("b", { score: 95, index: 0, durationSec: 70, startSec: 5 }),
    clip("c", { score: null, index: 1, durationSec: 40, startSec: 20 }),
  ];
  it("best first puts unscored clips last", () => expect(sortClips(list, "score").map((c) => c.id)).toEqual(["b", "a", "c"]));
  it("order in video", () => expect(sortClips(list, "order").map((c) => c.id)).toEqual(["b", "c", "a"]));
  it("longest first", () => expect(sortClips(list, "duration").map((c) => c.id)).toEqual(["b", "c", "a"]));
  it("recently added keeps the API order", () => expect(sortClips(list, "added").map((c) => c.id)).toEqual(["a", "b", "c"]));
  it("never mutates its input", () => {
    sortClips(list, "score");
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("visibleClips", () => {
  it("filters, then sorts", () => {
    const list = [clip("a", { isFavorite: true, score: 60 }), clip("b"), clip("c", { isFavorite: true, score: 90 })];
    expect(visibleClips(list, { flags: ["favorited"], lengths: [] }, "score").map((c) => c.id)).toEqual(["c", "a"]);
  });
});

describe("stepClip", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("steps and wraps both ways", () => {
    expect(stepClip(list, "a", 1)).toBe("b");
    expect(stepClip(list, "c", 1)).toBe("a");
    expect(stepClip(list, "a", -1)).toBe("c");
  });
  it("is null for a clip that isn't listed", () => expect(stepClip(list, "z", 1)).toBeNull());
});

describe("labels", () => {
  it("clipWindow shows minutes, and hours past an hour", () => {
    expect(clipWindow({ startSec: 286, endSec: 354 })).toBe("04:46 - 05:54");
    expect(clipWindow({ startSec: 3725, endSec: 3790 })).toBe("1:02:05 - 1:03:10");
  });
  it("clipName falls back to the clip number", () => {
    expect(clipName({ title: "  ", index: 2 })).toBe("Clip 3");
    expect(clipName({ title: "Hook", index: 2 })).toBe("Hook");
  });
});
