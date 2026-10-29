import { describe, expect, it } from "vitest";
import { validateDoc, type VideoClip } from "@/lib/editor/types";
import { buildStudioDoc, currentTemplateId, isFillerWord, parseStudioStep, studioCaptionCues, withTemplate } from "./studio";

describe("buildStudioDoc", () => {
  it("puts the whole video on the timeline in the chosen frame", () => {
    const doc = buildStudioDoc({ assetId: "a1", durationSec: 42.5, aspect: "4:5" });
    expect(doc.aspect).toBe("4:5");
    expect(doc.tracks.video).toEqual([expect.objectContaining({ assetId: "a1", timelineStart: 0, srcIn: 0, duration: 42.5 })]);
    expect(doc.tracks.caption).toEqual([]);
    expect(validateDoc(doc)).toBeNull();
  });

  it("keeps the video's own shape for original", () => {
    const doc = buildStudioDoc({ assetId: "a1", durationSec: 10, aspect: "original", videoSize: { w: 3840, h: 2160 } });
    expect(doc.aspect).toBe("original");
    expect(doc.size).toEqual({ w: 1920, h: 1080 });
    expect(validateDoc(doc)).toBeNull();
  });

  it("falls back to vertical when original has no size to keep", () => {
    expect(buildStudioDoc({ assetId: "a1", durationSec: 10, aspect: "original" }).aspect).toBe("9:16");
  });

  it("carries a saved look's style, and leaves an empty one out", () => {
    expect(buildStudioDoc({ assetId: "a1", durationSec: 5, aspect: "9:16", captionStyle: { accent: "#C8FF55" } }).captionStyle).toEqual({ accent: "#C8FF55" });
    expect("captionStyle" in buildStudioDoc({ assetId: "a1", durationSec: 5, aspect: "9:16", captionStyle: {} })).toBe(false);
  });
});

describe("captions from the transcript", () => {
  const video: VideoClip = { id: "v", type: "video", assetId: "a1", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false };
  const words = [
    { word: "So,", start: 0, end: 300 },
    { word: "um,", start: 300, end: 500 },
    { word: "umbrella", start: 500, end: 900 },
    { word: "uh", start: 900, end: 1000 },
    { word: "works", start: 1000, end: 1400 },
  ];

  it("spots single filler words, whole-word only", () => {
    expect(isFillerWord("Um,")).toBe(true);
    expect(isFillerWord("uh")).toBe(true);
    expect(isFillerWord("umbrella")).toBe(false);
    expect(isFillerWord("like")).toBe(false);
  });

  it("puts every cue on the template, dropping fillers when asked", () => {
    const cues = studioCaptionCues(words, video, { templateId: "clean", removeFillers: true });
    expect(cues.every((c) => c.templateId === "clean")).toBe(true);
    expect(cues.flatMap((c) => c.words!.map((w) => w.word))).toEqual(["So,", "umbrella", "works"]);
    const all = studioCaptionCues(words, video, { templateId: "clean", removeFillers: false });
    expect(all.flatMap((c) => c.words!.map((w) => w.word))).toHaveLength(5);
  });

  it("moves every cue to a new template", () => {
    const doc = { ...buildStudioDoc({ assetId: "a1", durationSec: 10, aspect: "9:16" }) };
    doc.tracks.caption = studioCaptionCues(words, doc.tracks.video[0]!, { templateId: "clean", removeFillers: false });
    const next = withTemplate(doc, "boardroom");
    expect(currentTemplateId(next)).toBe("boardroom");
    expect(next.tracks.caption.every((c) => c.templateId === "boardroom")).toBe(true);
    expect(validateDoc(next)).toBeNull();
  });
});

describe("parseStudioStep", () => {
  it("reads known steps and defaults to the template step", () => {
    expect(parseStudioStep("edit")).toBe("edit");
    expect(parseStudioStep("export")).toBe("export");
    expect(parseStudioStep("nope")).toBe("template");
    expect(parseStudioStep(null)).toBe("template");
  });
});
