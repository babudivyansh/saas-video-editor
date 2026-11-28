// Editor Phase 1: the additive timeline model (overlay lane, transforms,
// markers, track switches, fps) — validation, edit helpers and export graph.

import { describe, expect, it } from "vitest";
import { buildFilterGraph, type ClipInput } from "./filtergraph";
import { closeVideoGap, exportView, splitFreeClip, trimAtPlayhead } from "./doc-utils";
import type { AudioClip, CaptionClip, OverlayClip, TextClip, TimelineDoc, VideoClip } from "./types";
import { normalizeDoc, validateDoc } from "./types";

function video(over: Partial<VideoClip> & { id: string }): VideoClip {
  return { type: "video", assetId: "main", timelineStart: 0, duration: 4, srcIn: 0, volume: 1, muted: false, ...over };
}
function overlay(over: Partial<OverlayClip> & { id: string }): OverlayClip {
  return {
    type: "overlay", assetId: "pip", timelineStart: 1, duration: 2, srcIn: 0, volume: 1, muted: false,
    x: 0.7, y: 0.3, scalePct: 0.4, lane: 0, ...over,
  };
}
function doc(over: Partial<TimelineDoc> = {}, tracks: Partial<TimelineDoc["tracks"]> = {}): TimelineDoc {
  return {
    version: 1, aspect: "9:16", fps: 30, ...over,
    tracks: { video: [video({ id: "v1" })], text: [], audio: [], image: [], caption: [], overlay: [], ...tracks },
  };
}
function build(d: TimelineDoc) {
  const assets = new Map<string, ClipInput>([
    ["main", { filePath: "/tmp/main.mp4", hasAudio: true }],
    ["pip", { filePath: "/tmp/pip.mp4", hasAudio: true }],
    ["song", { filePath: "/tmp/song.mp3", hasAudio: true }],
  ]);
  return buildFilterGraph({ doc: d, assets, textFiles: new Map(), outputPath: "/tmp/out.mp4" });
}
const graphOf = (d: TimelineDoc) => {
  const { args } = build(d);
  return args[args.indexOf("-filter_complex") + 1];
};

describe("validateDoc — Phase 1 fields", () => {
  it("accepts a doc using every new field", () => {
    const d = doc(
      {
        fps: 60,
        magnet: true,
        markers: [{ id: "m1", t: 1.5, label: "Hook", color: "#ff0000" }],
        trackState: { overlay: { muted: true }, text: { hidden: true, locked: true } },
      },
      {
        video: [video({ id: "v1", scale: 0.8, offsetX: 0.1, offsetY: -0.2, rotationDeg: 15, flipH: true, opacity: 0.9 })],
        overlay: [overlay({ id: "o1", rotationDeg: -30, flipV: true, opacity: 0.5, fadeIn: 0.5, speed: 2, lane: 3 })],
      },
    );
    expect(validateDoc(d)).toBeNull();
  });

  it("still accepts an older doc with no overlay track", () => {
    const old = doc();
    delete (old.tracks as Partial<TimelineDoc["tracks"]>).overlay;
    expect(validateDoc(old)).toBeNull();
    expect(normalizeDoc(old).tracks.overlay).toEqual([]);
  });

  it.each([
    ["fps", doc({ fps: 48 as 30 })],
    ["overlay lane", doc({}, { overlay: [overlay({ id: "o1", lane: 4 })] })],
    ["scale", doc({}, { video: [video({ id: "v1", scale: 9 })] })],
    ["rotation", doc({}, { video: [video({ id: "v1", rotationDeg: 400 })] })],
    ["marker", doc({ markers: [{ id: "../x", t: 1 }] })],
    ["trackState kind", doc({ trackState: { bogus: { hidden: true } } as TimelineDoc["trackState"] })],
    ["groupId", doc({}, { video: [video({ id: "v1", groupId: "a/b" })] })],
  ])("rejects an invalid %s", (_label, d) => {
    expect(validateDoc(d)).not.toBeNull();
  });
});

describe("edit helpers", () => {
  it("splits an audio clip, advancing srcIn and keeping fades on the outer edges", () => {
    const a: AudioClip = { type: "audio", id: "a", assetId: "song", timelineStart: 2, duration: 6, srcIn: 1, volume: 1, fadeIn: 1, fadeOut: 1 };
    const [l, r] = splitFreeClip(a, 5, "a2")!;
    expect(l).toMatchObject({ duration: 3, srcIn: 1, fadeIn: 1, fadeOut: undefined });
    expect(r).toMatchObject({ id: "a2", timelineStart: 5, duration: 3, srcIn: 4, fadeIn: undefined, fadeOut: 1 });
  });

  it("splits an overlay at speed 2, consuming source twice as fast", () => {
    const [, r] = splitFreeClip(overlay({ id: "o", timelineStart: 0, duration: 4, speed: 2 }), 1, "o2")!;
    expect(r.srcIn).toBe(2);
  });

  it("shares text keyframes out by time when splitting", () => {
    const t = {
      type: "text", id: "t", timelineStart: 0, duration: 4, text: "x", fontFamily: "Inter", fontSizePct: 0.05,
      color: "#ffffff", bold: false, align: "center", x: 0.5, y: 0.5, bgColor: null,
      keyframes: [{ t: 0, x: 0.1, y: 0.1, scale: 1, opacity: 1 }, { t: 3, x: 0.9, y: 0.9, scale: 1, opacity: 1 }],
    } as unknown as TextClip;
    const [l, r] = splitFreeClip(t, 2, "t2")!;
    expect(l.keyframes?.map((k) => k.t)).toEqual([0]);
    expect(r.keyframes?.map((k) => k.t)).toEqual([1]);
  });

  it("Q removes the head of a clip and W the tail", () => {
    const v = video({ id: "v", timelineStart: 2, duration: 6, srcIn: 1 });
    expect(trimAtPlayhead(v, 5, "left")).toMatchObject({ timelineStart: 5, duration: 3, srcIn: 4 });
    expect(trimAtPlayhead(v, 5, "right")).toMatchObject({ timelineStart: 2, duration: 3, srcIn: 1 });
    expect(trimAtPlayhead(v, 9, "right")).toBeNull();
  });

  it("W on a caption drops the words after the playhead", () => {
    const c = {
      type: "caption", id: "c", timelineStart: 0, duration: 2, text: "one two", highlightMode: "none",
      fontFamily: "Inter", fontSizePct: 0.04, color: "#ffffff", bold: true, x: 0.5, y: 0.8, bgColor: null,
      words: [{ word: "one", startMs: 0, endMs: 800 }, { word: "two", startMs: 1200, endMs: 1900 }],
    } as unknown as CaptionClip;
    expect(trimAtPlayhead(c, 1, "right")).toMatchObject({ text: "one", duration: 1 });
  });

  it("closes a main-lane gap after a delete (magnet)", () => {
    const track = [video({ id: "a", timelineStart: 0, duration: 2 }), video({ id: "c", timelineStart: 5, duration: 2 })];
    expect(closeVideoGap(track, 2, 3).map((c) => c.timelineStart)).toEqual([0, 2]);
  });
});

describe("exportView — track switches", () => {
  it("drops hidden tracks and clips, silences muted ones, blacks out a hidden main lane", () => {
    const d = doc(
      { trackState: { video: { hidden: true }, overlay: { muted: true }, audio: { muted: true } } },
      {
        overlay: [overlay({ id: "o1" }), overlay({ id: "o2", hidden: true })],
        audio: [{ type: "audio", id: "a", assetId: "song", timelineStart: 0, duration: 4, srcIn: 0, volume: 1 }],
      },
    );
    const v = exportView(d);
    expect(v.tracks.video[0].opacity).toBe(0);
    expect(v.tracks.overlay.map((o) => [o.id, o.muted])).toEqual([["o1", true]]);
    expect(v.tracks.audio).toEqual([]);
    expect(v.trackState).toBeUndefined();
  });
});

describe("filtergraph — Phase 1", () => {
  it("leaves an untouched doc's graph without transform or overlay statements", () => {
    const g = graphOf(doc());
    expect(g).not.toContain("v0trfg");
    expect(g).not.toContain("ovp");
    expect(g).toContain("fps=30");
  });

  it("uses the doc frame rate", () => {
    const g = graphOf(doc({ fps: 60 }));
    expect(g).toContain("fps=60");
    expect(g).not.toContain("fps=30");
  });

  it("draws a transformed main clip onto a black frame, offset and rotated", () => {
    const g = graphOf(doc({}, { video: [video({ id: "v1", scale: 0.5, offsetX: 0.25, rotationDeg: 90, flipH: true })] }));
    expect(g).toContain("color=c=black:s=1080x1920");
    expect(g).toContain("scale=540:960");
    expect(g).toContain("hflip");
    expect(g).toContain("rotate=1.5708:ow='rotw(1.5708)'");
    expect(g).toContain("(main_w-overlay_w)/2+270");
  });

  it("composites an overlay with its own timing and mixes its audio", () => {
    const g = graphOf(doc({}, { overlay: [overlay({ id: "o1", timelineStart: 1, duration: 2 })] }));
    expect(g).toContain("setpts=PTS+1/TB");
    expect(g).toContain("enable='between(t,1,3)'");
    expect(g).toContain("adelay=1000|1000[ova0]");
    expect(g).toContain("[ova0]");
    expect(g).toMatch(/amix=inputs=2/);
  });

  it("leaves a muted overlay's audio out", () => {
    const g = graphOf(doc({}, { overlay: [overlay({ id: "o1", muted: true })] }));
    expect(g).not.toContain("ova0");
  });
});
