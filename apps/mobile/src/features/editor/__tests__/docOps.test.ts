import { validateDoc, type TimelineDoc, type VideoClip } from "@clipiro/shared";
import { addText, captionPosition, closeVideoGaps, duplicate, insertAssets, insertMedia, moveVideo, remove, replaceCaptions, setLook, setOriginalVolume, setTexts, split, styleCaptions, trimVideo } from "../docOps";

// Every edit must leave a doc the server's renderer accepts (validateDoc), and
// the video track must stay one continuous run.

const v = (id: string, start: number, duration: number, srcIn = 0): VideoClip => ({ id, type: "video", assetId: "a1", timelineStart: start, duration, srcIn, volume: 1, muted: false });
const doc = (): TimelineDoc => ({
  version: 1,
  aspect: "9:16",
  fps: 30,
  tracks: {
    video: [v("v1", 0, 10), v("v2", 10, 5, 3)],
    text: [],
    audio: [],
    image: [],
    caption: [
      { id: "c1", type: "caption", timelineStart: 0, duration: 2, text: "nobody tells you", words: [{ word: "nobody", startMs: 0, endMs: 600 }, { word: "tells", startMs: 600, endMs: 1200 }, { word: "you", startMs: 1200, endMs: 2000 }], fontFamily: "Poppins", fontSizePct: 0.05, color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.8, highlightMode: "word" },
      { id: "c2", type: "caption", timelineStart: 2, duration: 2, text: "typed by hand", fontFamily: "Poppins", fontSizePct: 0.05, color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.8, highlightMode: "none" },
    ],
  },
});
const ok = (d: TimelineDoc) => expect(validateDoc(d)).toBeNull();
const starts = (d: TimelineDoc) => d.tracks.video.map((c) => [c.id, c.timelineStart, c.duration]);

describe("timeline edits", () => {
  it("splits the video clip under the playhead, keeping the source in sync", () => {
    const r = split(doc(), 4, null)!;
    ok(r.doc);
    expect(r.doc.tracks.video.map((c) => [c.timelineStart, c.duration, c.srcIn])).toEqual([[0, 4, 0], [4, 6, 4], [10, 5, 3]]);
    expect(r.selected).toEqual({ track: "video", id: r.doc.tracks.video[1]!.id });
    expect(split(doc(), 0.01, null)).toBeNull();
  });

  it("splits a selected caption between its words", () => {
    const r = split(doc(), 0.5, { track: "caption", id: "c1" })!;
    ok(r.doc);
    expect(r.doc.tracks.caption.map((c) => c.text)).toEqual(["nobody", "tells you", "typed by hand"]);
  });

  it("duplicates a video clip in place and moves the rest along", () => {
    const r = duplicate(doc(), { track: "video", id: "v1" })!;
    ok(r.doc);
    expect(starts(r.doc)).toEqual([["v1", 0, 10], [r.selected.id, 10, 10], ["v2", 20, 5]]);
  });

  it("duplicates a caption after the last cue, so cues never overlap", () => {
    const r = duplicate(doc(), { track: "caption", id: "c1" })!;
    ok(r.doc);
    expect(r.doc.tracks.caption.at(-1)).toMatchObject({ text: "nobody tells you", timelineStart: 4 });
  });

  it("deleting a video clip closes the gap", () => {
    const d = remove(doc(), { track: "video", id: "v1" });
    ok(d);
    expect(starts(d)).toEqual([["v2", 0, 5]]);
  });

  it("trims within the source and keeps the track continuous", () => {
    let d = trimVideo(doc(), "v2", "start", 2, 20);
    ok(d);
    expect(d.tracks.video[1]).toMatchObject({ timelineStart: 10, duration: 3, srcIn: 5 });
    // Pulling the start back can't go before the file's first frame.
    d = trimVideo(doc(), "v2", "start", -10, 20);
    expect(d.tracks.video[1]).toMatchObject({ duration: 8, srcIn: 0 });
    // Shortening the first clip pulls the next one in.
    d = trimVideo(doc(), "v1", "end", 4, 10);
    expect(starts(d)).toEqual([["v1", 0, 6], ["v2", 6, 5]]);
    // Lengthening stops at the end of the source.
    d = trimVideo(doc(), "v1", "end", -30, 12);
    expect(d.tracks.video[0]!.duration).toBe(12);
    ok(d);
  });

  it("reorders video clips", () => {
    const d = moveVideo(doc(), "v2", -1);
    ok(d);
    expect(starts(d)).toEqual([["v2", 0, 5], ["v1", 5, 10]]);
    expect(moveVideo(doc(), "v1", -1)).toEqual(doc());
  });

  it("lays any video track end to end", () => {
    expect(closeVideoGaps([v("b", 12, 2), v("a", 3, 4)]).map((c) => [c.id, c.timelineStart])).toEqual([["a", 0], ["b", 4]]);
  });
});

describe("panel edits", () => {
  it("sets a look on one clip or all, and the original volume", () => {
    let d = setLook(doc(), ["v2"], { filter: "warm", transitionOut: "fade" });
    expect(d.tracks.video.map((c) => c.filter ?? "none")).toEqual(["none", "warm"]);
    d = setLook(d, "all", { effect: "zoomPulse" });
    expect(d.tracks.video.every((c) => c.effect === "zoomPulse")).toBe(true);
    d = setOriginalVolume(d, 0);
    expect(d.tracks.video.every((c) => c.volume === 0 && c.muted)).toBe(true);
    ok(d);
  });

  it("styles every caption, without word highlights on hand-typed cues", () => {
    const d = styleCaptions(doc(), { highlightMode: "karaoke", ...captionPosition("top"), color: "#20d68a" });
    ok(d);
    expect(d.tracks.caption.map((c) => [c.highlightMode, c.y, c.color])).toEqual([
      ["karaoke", 0.15, "#20d68a"],
      ["none", 0.15, "#20d68a"],
    ]);
  });

  it("adds text at the playhead", () => {
    const r = addText(doc(), 14, { text: "Hook", fontFamily: "Poppins", fontSizePct: 0.06, color: "#ffffff", bold: true, align: "center", x: 0.5, y: 0.2, bgColor: null });
    ok(r.doc);
    expect(r.doc.tracks.text[0]).toMatchObject({ text: "Hook", timelineStart: 14, duration: 3 });
  });
});

describe("adding media and captions", () => {
  it("puts a video in at the next cut, moving the rest along", () => {
    const r = insertMedia(doc(), { id: "a9", kind: "video", durationSec: 4 }, 3);
    ok(r.doc);
    expect(starts(r.doc).map(([, s, d]) => [s, d])).toEqual([[0, 10], [10, 4], [14, 5]]);
    expect(r.doc.tracks.video[1]!.assetId).toBe("a9");
  });

  it("lays an image over the video, and audio under it", () => {
    let r = insertMedia(doc(), { id: "img", kind: "image", durationSec: null }, 12);
    ok(r.doc);
    expect(r.doc.tracks.image[0]).toMatchObject({ assetId: "img", timelineStart: 12, duration: 3, scalePct: 1 });
    r = insertMedia(doc(), { id: "mus", kind: "audio", durationSec: 30 }, 0);
    expect(r.doc.tracks.audio[0]).toMatchObject({ assetId: "mus", duration: 30 });
  });

  it("puts several files in one after another", () => {
    const r = insertAssets(doc(), [{ id: "a8", kind: "video", durationSec: 2 }, { id: "a9", kind: "video", durationSec: 3 }, { id: "img", kind: "image", durationSec: null }], 3);
    ok(r.doc);
    expect(r.doc.tracks.video.map((c) => [c.assetId, c.timelineStart, c.duration])).toEqual([["a1", 0, 10], ["a8", 10, 2], ["a9", 12, 3], ["a1", 15, 5]]);
    expect(r.doc.tracks.image[0]).toMatchObject({ assetId: "img", timelineStart: 15 });
    expect(r.selected).toEqual({ track: "image", id: r.doc.tracks.image[0]!.id });
  });

  it("replaces captions and rewrites them, dropping stale word timings", () => {
    let d = replaceCaptions(doc(), [doc().tracks.caption[1]!, doc().tracks.caption[0]!]);
    expect(d.tracks.caption.map((c) => c.id)).toEqual(["c1", "c2"]);
    d = setTexts(d, "caption", [{ id: "c1", text: "nadie te cuenta" }]);
    ok(d);
    expect(d.tracks.caption[0]).toMatchObject({ text: "nadie te cuenta", words: undefined, highlightMode: "none" });
    expect(d.tracks.caption[1]!.text).toBe("typed by hand");
  });
});
