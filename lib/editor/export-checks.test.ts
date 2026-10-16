import { describe, expect, it } from "vitest";
import { DEFAULT_DOC, type CaptionClip, type TextClip, type TimelineDoc, type VideoClip } from "./types";
import { hasBlockingCheck, runExportChecks } from "./export-checks";
import { captionsToSrt } from "./srt";

const video = (over: Partial<VideoClip> = {}): VideoClip => ({
  id: "v1", type: "video", assetId: "a1", srcIn: 0, timelineStart: 0, duration: 10, volume: 1, muted: false, ...over,
});
const caption = (over: Partial<CaptionClip> = {}): CaptionClip => ({
  id: "c1", type: "caption", text: "Hello there", timelineStart: 1, duration: 2,
  fontFamily: "Inter" as CaptionClip["fontFamily"], fontSizePct: 0.05, color: "#ffffff", bold: true, bgColor: null,
  x: 0.5, y: 0.75, highlightMode: "none", ...over,
});
const text = (over: Partial<TextClip> = {}): TextClip => ({
  id: "t1", type: "text", text: "Watch till the end", timelineStart: 0, duration: 5,
  fontFamily: "Inter" as TextClip["fontFamily"], fontSizePct: 0.05, color: "#ffffff", bold: true, align: "center",
  x: 0.5, y: 0.75, bgColor: null, ...over,
});
const doc = (tracks: Partial<TimelineDoc["tracks"]>): TimelineDoc => ({
  ...structuredClone(DEFAULT_DOC),
  tracks: { ...structuredClone(DEFAULT_DOC).tracks, ...tracks },
});

describe("runExportChecks", () => {
  it("blocks an export with no video", () => {
    const checks = runExportChecks(doc({}));
    expect(hasBlockingCheck(checks)).toBe(true);
    expect(checks.find((c) => c.id === "no-video")?.level).toBe("block");
  });

  it("passes a plain timeline", () => {
    const checks = runExportChecks(doc({ video: [video()] }));
    expect(hasBlockingCheck(checks)).toBe(false);
    expect(checks.every((c) => c.level === "ok")).toBe(true);
  });

  it("warns about captions near the frame edge and points at the first one", () => {
    const checks = runExportChecks(doc({ video: [video()], caption: [caption({ id: "low", y: 0.95, timelineStart: 3 })] }));
    const c = checks.find((x) => x.id === "caption-safe-area");
    expect(c?.level).toBe("warn");
    expect(c?.at).toBe(3);
    expect(c?.clip).toEqual({ track: "caption", id: "low" });
  });

  it("warns when text and a caption share the same spot at the same time", () => {
    const checks = runExportChecks(doc({ video: [video()], caption: [caption()], text: [text()] }));
    const c = checks.find((x) => x.id === "text-t1");
    expect(c).toBeUndefined();
    const clash = checks.find((x) => x.id.startsWith("text-caption-"));
    expect(clash?.level).toBe("warn");
    expect(clash?.at).toBe(1);
  });

  it("does not flag text far from the captions", () => {
    const checks = runExportChecks(doc({ video: [video()], caption: [caption()], text: [text({ y: 0.2 })] }));
    expect(checks.some((x) => x.id.startsWith("text-caption-"))).toBe(false);
  });

  it("warns when nothing makes a sound", () => {
    const checks = runExportChecks(doc({ video: [video({ muted: true })] }));
    expect(checks.find((c) => c.id === "no-sound")?.level).toBe("warn");
  });

  it("ignores hidden clips but says they are left out", () => {
    const checks = runExportChecks(doc({ video: [video(), video({ id: "v2", hidden: true, muted: true })] }));
    expect(checks.find((c) => c.id === "hidden")?.message).toMatch(/1 hidden clip is left out/);
  });
});

describe("captionsToSrt", () => {
  it("numbers visible cues in time order with SRT timestamps", () => {
    const srt = captionsToSrt([
      caption({ id: "b", text: "Second", timelineStart: 65.5, duration: 1.25 }),
      caption({ id: "a", text: "First", timelineStart: 0, duration: 2 }),
      caption({ id: "h", text: "Hidden", hidden: true }),
      caption({ id: "e", text: "   " }),
    ]);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:02,000\nFirst\n\n2\n00:01:05,500 --> 00:01:06,750\nSecond\n");
  });
});
