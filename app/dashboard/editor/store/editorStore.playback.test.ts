import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";
import { DEFAULT_DOC, MAX_CLIPS_PER_TRACK, type TimelineDoc, type VideoClip } from "@/lib/editor/types";

const clip = (id: string, timelineStart: number, duration: number, extra: Partial<VideoClip> = {}): VideoClip => ({
  type: "video", id, assetId: "a1", timelineStart, duration, srcIn: 0, volume: 1, muted: false, ...extra,
});

function load(video: VideoClip[]) {
  const doc: TimelineDoc = { ...structuredClone(DEFAULT_DOC), tracks: { ...DEFAULT_DOC.tracks, video } };
  useEditorStore.getState().loadProject("p1", doc, 1);
}

describe("playhead + playback", () => {
  beforeEach(() => load([clip("a", 0, 10)]));

  it("Play at the end restarts from the start", () => {
    const s = useEditorStore.getState();
    s.setCurrentTime(10);
    s.setPlaying(true);
    expect(useEditorStore.getState()).toMatchObject({ playing: true, currentTime: 0 });
  });

  it("Play mid-timeline keeps the position", () => {
    const s = useEditorStore.getState();
    s.setCurrentTime(4);
    s.setPlaying(true);
    expect(useEditorStore.getState()).toMatchObject({ playing: true, currentTime: 4 });
  });

  it("an empty timeline never starts playing", () => {
    load([]);
    useEditorStore.getState().setPlaying(true);
    expect(useEditorStore.getState().playing).toBe(false);
  });

  it("seeks are clamped to the timeline", () => {
    const s = useEditorStore.getState();
    s.setCurrentTime(99);
    expect(useEditorStore.getState().currentTime).toBe(10);
    s.setCurrentTime(-5);
    expect(useEditorStore.getState().currentTime).toBe(0);
    s.setCurrentTime(Number.NaN);
    expect(useEditorStore.getState().currentTime).toBe(0);
  });
});

describe("edits", () => {
  it("Delete leaves a locked clip alone", () => {
    load([clip("a", 0, 5, { locked: true })]);
    const s = useEditorStore.getState();
    s.select({ track: "video", clipId: "a" });
    s.deleteSelected();
    expect(useEditorStore.getState().doc.tracks.video).toHaveLength(1);
  });

  it("a typed start time can't make video clips overlap", () => {
    load([clip("a", 0, 5), clip("b", 5, 5)]);
    useEditorStore.getState().updateClip("video", "b", { timelineStart: 2 });
    const [a, b] = useEditorStore.getState().doc.tracks.video;
    expect(b.timelineStart).toBeGreaterThanOrEqual(a.timelineStart + a.duration);
  });

  it("a typed duration stops at the next clip", () => {
    load([clip("a", 0, 5), clip("b", 6, 5)]);
    useEditorStore.getState().updateClip("video", "a", { duration: 30 });
    expect(useEditorStore.getState().doc.tracks.video[0].duration).toBe(6);
  });

  it("loading a doc with overlapping clips repairs it", () => {
    load([clip("a", 0, 6), clip("b", 4, 5)]);
    expect(useEditorStore.getState().doc.tracks.video[1].timelineStart).toBe(6);
  });

  it("duplicate stops at the per-track clip cap", () => {
    load(Array.from({ length: MAX_CLIPS_PER_TRACK }, (_, i) => clip(`c${i}`, i, 1)));
    const s = useEditorStore.getState();
    s.select({ track: "video", clipId: "c0" });
    s.duplicateSelected();
    expect(useEditorStore.getState().doc.tracks.video).toHaveLength(MAX_CLIPS_PER_TRACK);
  });
});
