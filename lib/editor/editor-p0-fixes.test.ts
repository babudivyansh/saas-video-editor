// Editor Phase 0: preview/export agreement helpers and the caption range.

import { describe, expect, it } from "vitest";
import { audioClipsAt, fadeOpacityAt } from "./doc-utils";
import { CAPTION_RANGE_PAD_SEC, captionSourceRange } from "./caption-generation";
import type { AudioClip, TimelineDoc, VideoClip } from "./types";

function audio(over: Partial<AudioClip> & { id: string }): AudioClip {
  return { type: "audio", assetId: `a-${over.id}`, timelineStart: 0, duration: 5, srcIn: 0, volume: 1, ...over };
}

function doc(audioClips: AudioClip[]): TimelineDoc {
  return { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: audioClips, image: [], caption: [] } };
}

function video(over: Partial<VideoClip>): VideoClip {
  return { type: "video", id: "v", assetId: "x", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false, ...over };
}

describe("audioClipsAt", () => {
  it("returns every overlapping clip, like the export's amix", () => {
    const d = doc([audio({ id: "music" }), audio({ id: "vo", timelineStart: 2 }), audio({ id: "later", timelineStart: 6 })]);
    expect(audioClipsAt(d, 3).map((c) => c.id)).toEqual(["music", "vo"]);
    expect(audioClipsAt(d, 6.5).map((c) => c.id)).toEqual(["vo", "later"]);
  });

  it("leaves hidden clips out, as the export does", () => {
    const d = doc([audio({ id: "music", hidden: true }), audio({ id: "vo" })]);
    expect(audioClipsAt(d, 1).map((c) => c.id)).toEqual(["vo"]);
  });
});

describe("fadeOpacityAt", () => {
  it("ramps in and out over the fade lengths", () => {
    expect(fadeOpacityAt(0, 10, 2, 2)).toBe(0);
    expect(fadeOpacityAt(1, 10, 2, 2)).toBeCloseTo(0.5);
    expect(fadeOpacityAt(5, 10, 2, 2)).toBe(1);
    expect(fadeOpacityAt(9, 10, 2, 2)).toBeCloseTo(0.5);
  });

  it("is 1 with no fades", () => {
    expect(fadeOpacityAt(0, 10)).toBe(1);
  });
});

describe("captionSourceRange", () => {
  it("spans the earliest trim-in to the latest trim-out, padded", () => {
    const r = captionSourceRange([video({ srcIn: 10, duration: 5 }), video({ srcIn: 30, duration: 4, speed: 2 })]);
    expect(r.fromSec).toBeCloseTo(10 - CAPTION_RANGE_PAD_SEC);
    expect(r.toSec).toBeCloseTo(38 + CAPTION_RANGE_PAD_SEC);
  });

  it("never starts before 0", () => {
    expect(captionSourceRange([video({ srcIn: 0.2 })]).fromSec).toBe(0);
  });
});
