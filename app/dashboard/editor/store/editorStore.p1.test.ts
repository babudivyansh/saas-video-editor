// Editor Phase 1 store actions: multi-select, groups, magnet, Q/W, markers,
// track switches, split on free tracks.

import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";
import { DEFAULT_DOC, type AudioClip, type TimelineDoc, type VideoClip } from "@/lib/editor/types";

const v = (id: string, timelineStart: number, duration: number): VideoClip => ({
  type: "video", id, assetId: "a1", timelineStart, duration, srcIn: 0, volume: 1, muted: false,
});
const a = (id: string, timelineStart: number, duration: number): AudioClip => ({
  type: "audio", id, assetId: "s1", timelineStart, duration, srcIn: 0, volume: 1,
});

function load(video: VideoClip[], audio: AudioClip[] = [], extra: Partial<TimelineDoc> = {}) {
  const doc: TimelineDoc = { ...structuredClone(DEFAULT_DOC), ...extra, tracks: { ...DEFAULT_DOC.tracks, video, audio } };
  useEditorStore.getState().loadProject("p1", doc, 1);
}
const st = () => useEditorStore.getState();

describe("multi-select and groups", () => {
  beforeEach(() => load([v("a", 0, 2), v("b", 2, 2), v("c", 4, 2)], [a("m", 0, 6)]));

  it("Shift-click adds to the selection; Delete removes them all", () => {
    st().select({ track: "video", clipId: "a" });
    st().toggleSelect({ track: "audio", clipId: "m" });
    st().deleteSelected();
    expect(st().doc.tracks.video.map((c) => c.id)).toEqual(["b", "c"]);
    expect(st().doc.tracks.audio).toEqual([]);
  });

  it("toggling a picked clip again removes it", () => {
    st().select({ track: "video", clipId: "a" });
    st().toggleSelect({ track: "video", clipId: "b" });
    st().toggleSelect({ track: "video", clipId: "b" });
    expect(st().extraSelection).toEqual([]);
  });

  it("a group deletes together when one member is selected", () => {
    st().select({ track: "video", clipId: "a" });
    st().toggleSelect({ track: "audio", clipId: "m" });
    st().groupSelected();
    st().select({ track: "audio", clipId: "m" });
    st().deleteSelected();
    expect(st().doc.tracks.video.map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("main-track magnet", () => {
  it("off: deleting a main clip leaves a gap", () => {
    load([v("a", 0, 2), v("b", 2, 2)]);
    st().select({ track: "video", clipId: "a" });
    st().deleteSelected();
    expect(st().doc.tracks.video[0].timelineStart).toBe(2);
  });

  it("on: deleting a main clip closes the gap", () => {
    load([v("a", 0, 2), v("b", 2, 2)], [], { magnet: true });
    st().select({ track: "video", clipId: "a" });
    st().deleteSelected();
    expect(st().doc.tracks.video[0].timelineStart).toBe(0);
  });
});

describe("Q / W, ripple delete, split", () => {
  beforeEach(() => load([v("a", 0, 4), v("b", 4, 4)], [a("m", 0, 8)]));

  it("W removes the tail of the selected clip", () => {
    st().select({ track: "video", clipId: "a" });
    st().setCurrentTime(1);
    st().trimSelectedAtPlayhead("right");
    expect(st().doc.tracks.video[0]).toMatchObject({ duration: 1 });
  });

  it("Shift+Delete closes the gap on every track", () => {
    st().select({ track: "video", clipId: "a" });
    st().rippleDeleteSelected();
    expect(st().doc.tracks.video).toHaveLength(1);
    expect(st().doc.tracks.video[0].timelineStart).toBe(0);
    expect(st().doc.tracks.audio[0].duration).toBe(4);
  });

  it("splits an audio clip at the playhead", () => {
    st().select({ track: "audio", clipId: "m" });
    st().setCurrentTime(3);
    st().splitAtPlayhead();
    expect(st().doc.tracks.audio.map((c) => [c.timelineStart, c.duration, c.srcIn])).toEqual([[0, 3, 0], [3, 5, 3]]);
  });
});

describe("markers and track switches", () => {
  beforeEach(() => load([v("a", 0, 4)]));

  it("M adds a marker and M at the same spot removes it", () => {
    st().setCurrentTime(2);
    st().toggleMarker();
    expect(st().doc.markers?.map((m) => m.t)).toEqual([2]);
    st().toggleMarker();
    expect(st().doc.markers).toEqual([]);
  });

  it("a locked track protects its clips from delete", () => {
    st().setTrackState("video", { locked: true });
    st().select({ track: "video", clipId: "a" });
    st().deleteSelected();
    expect(st().doc.tracks.video).toHaveLength(1);
  });

  it("switching a flag off removes the entry", () => {
    st().setTrackState("video", { hidden: true });
    st().setTrackState("video", { hidden: false });
    expect(st().doc.trackState?.video).toBeUndefined();
  });
});
