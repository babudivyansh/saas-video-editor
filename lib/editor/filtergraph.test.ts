// Pure string-level tests of the filtergraph builder — no ffmpeg run needed.
// Focus: effects splice into the per-clip chain, transitions produce a
// tpad+xfade fold that preserves total duration, and docs without either
// keep the exact legacy single-concat graph shape.

import { describe, expect, it } from "vitest";
import { buildFilterGraph, type ClipInput } from "./filtergraph";
import type { TimelineDoc, VideoClip } from "./types";
import { TRANSITION_DURATION_SEC } from "./types";

function videoClip(overrides: Partial<VideoClip> & { id: string }): VideoClip {
  return {
    type: "video",
    assetId: "asset1",
    timelineStart: 0,
    duration: 4,
    srcIn: 0,
    volume: 1,
    muted: false,
    ...overrides,
  };
}

function doc(video: VideoClip[]): TimelineDoc {
  return {
    version: 1,
    aspect: "9:16",
    fps: 30,
    tracks: { video, text: [], audio: [], image: [], caption: [] },
  };
}

function assetsFor(d: TimelineDoc): Map<string, ClipInput> {
  const m = new Map<string, ClipInput>();
  for (const c of d.tracks.video) m.set(c.assetId, { filePath: `/tmp/${c.assetId}.mp4`, hasAudio: true });
  return m;
}

function build(d: TimelineDoc) {
  return buildFilterGraph({
    doc: d,
    assets: assetsFor(d),
    textFiles: new Map(),
    outputPath: "/tmp/out.mp4",
  });
}

describe("effects", () => {
  it("splices the effect filter into the clip's video chain", () => {
    const d = doc([videoClip({ id: "c1", effect: "chromaticAberration" })]);
    const { filterComplex } = build(d);
    expect(filterComplex).toContain("rgbashift=rh=4:bh=-4");
  });

  it("uses concrete output dimensions for dimension-aware effects", () => {
    const d = doc([videoClip({ id: "c1", effect: "shake" })]);
    const { filterComplex } = build(d);
    // 9:16 output is 1080x1920 — the shake crop must target those dims
    expect(filterComplex).toMatch(/crop=1080:1920:x='\(iw-1080\)/);
  });

  it("adds nothing for effect 'none' or unset", () => {
    const plain = build(doc([videoClip({ id: "c1" })])).filterComplex;
    const none = build(doc([videoClip({ id: "c1", effect: "none" })])).filterComplex;
    expect(none).toBe(plain);
    expect(plain).not.toContain("rgbashift");
    expect(plain).not.toContain("zoompan");
  });
});

describe("transitions", () => {
  const twoClips = (transitionOut?: VideoClip["transitionOut"]) =>
    doc([
      videoClip({ id: "c1", duration: 4, transitionOut }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 4, duration: 3 }),
    ]);

  it("keeps the legacy interleaved concat when no transitions are set", () => {
    const { filterComplex } = build(twoClips());
    expect(filterComplex).toContain("concat=n=2:v=1:a=1[vbase][abase]");
    expect(filterComplex).not.toContain("xfade");
    expect(filterComplex).not.toContain("tpad");
  });

  it("emits tpad + xfade at the boundary and preserves total duration", () => {
    const result = build(twoClips("fade"));
    const fc = result.filterComplex;
    expect(fc).toContain(`tpad=stop_mode=clone:stop_duration=${TRANSITION_DURATION_SEC}`);
    // offset = end of the first clip (4s), duration = 0.5s
    expect(fc).toContain(`xfade=transition=fade:duration=${TRANSITION_DURATION_SEC}:offset=4`);
    // audio joins as a plain hard-cut concat (timings unchanged)
    expect(fc).toContain("concat=n=2:v=0:a=1[abase]");
    // total output duration unchanged by the transition
    expect(result.durationSec).toBe(7);
    expect(result.args[result.args.indexOf("-t") + 1]).toBe("7");
  });

  it("normalizes segments for xfade (format + settb) only when transitions exist", () => {
    expect(build(twoClips("dipToBlack")).filterComplex).toContain("settb=AVTB");
    expect(build(twoClips()).filterComplex).not.toContain("settb=AVTB");
  });

  it("maps preset names to xfade transition names", () => {
    expect(build(twoClips("dipToBlack")).filterComplex).toContain("xfade=transition=fadeblack");
    expect(build(twoClips("slideLeft")).filterComplex).toContain("xfade=transition=slideleft");
    expect(build(twoClips("wipe")).filterComplex).toContain("xfade=transition=wipeleft");
  });

  it("falls back to a hard cut for unsupported presets (zoomOut) and 'none'", () => {
    for (const t of ["zoomOut", "none"] as const) {
      const fc = build(twoClips(t)).filterComplex;
      expect(fc).not.toContain("xfade");
    }
  });

  it("ignores a transition set on the last clip", () => {
    const d = doc([videoClip({ id: "c1", duration: 4, transitionOut: "fade" })]);
    const fc = build(d).filterComplex;
    expect(fc).not.toContain("xfade");
  });

  it("clamps the crossfade to the incoming clip's duration", () => {
    const d = doc([
      videoClip({ id: "c1", duration: 4, transitionOut: "fade" }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 4, duration: 0.3 }),
    ]);
    const fc = build(d).filterComplex;
    expect(fc).toContain("xfade=transition=fade:duration=0.3:offset=4");
  });

  it("handles three clips with mixed boundaries", () => {
    const d = doc([
      videoClip({ id: "c1", duration: 2, transitionOut: "fade" }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 2, duration: 3 }),
      videoClip({ id: "c3", assetId: "asset3", timelineStart: 5, duration: 1 }),
    ]);
    const result = build(d);
    const fc = result.filterComplex;
    // fade at boundary 1 (offset 2), hard cut (pairwise concat) at boundary 2
    expect(fc).toContain("xfade=transition=fade:duration=0.5:offset=2");
    expect(fc).toContain("concat=n=2:v=1:a=0");
    expect(fc).toContain("concat=n=3:v=0:a=1[abase]");
    expect(result.durationSec).toBe(6);
  });
});
