// @vitest-environment node
import { describe, it, expect } from "vitest";
import { captionMotion } from "./caption-motion";
import { getCaptionTemplate } from "./caption-templates";
import { buildAnimatedEvents } from "@/utils/ffmpeg-render";
import type { SignalTrack } from "./signal-track";
import type { WordTiming } from "@/utils/elevenlabs";

const words: WordTiming[] = [
  { word: "this", start: 0, end: 400 },
  { word: "is", start: 400, end: 600 },
  { word: "insane", start: 600, end: 1200 },
] as WordTiming[];

/** A signal track with a real envelope; only the fields motion reads matter. */
const signal = {
  v: 1, hz: 20,
  rms: [0.5, 0.5], pitch: [0.5, 0.5], energy: [0.2, 0.9, 0.4],
  scenes: [], pauses: [], wordsPerSec: 2.5, emphasis: [2],
} as unknown as SignalTrack;

const emojiTemplate = getCaptionTemplate("hormozi");   // emoji: true
const plainTemplate = getCaptionTemplate("minimal");   // emoji: false, no keywordColor

describe("captionMotion", () => {
  it("places emoji when there is NO signal track at all", () => {
    // The regression this helper exists for. Both call sites used to nest the
    // whole motion block inside `if (signal?.energy.length)`, so a clip with no
    // signal rendered an emoji template with no emoji — and nothing surfaced
    // why. Emoji come from the template, not from the audio.
    const motion = captionMotion(words, emojiTemplate, null);
    expect(motion?.emoji).toEqual({ 2: "🔥" });
    expect(motion?.energy).toBeUndefined();
  });

  it("places emoji when the signal track exists but is empty", () => {
    const empty = { ...signal, energy: [] } as unknown as SignalTrack;
    expect(captionMotion(words, emojiTemplate, empty)?.emoji).toEqual({ 2: "🔥" });
  });

  it("carries energy, emphasis and emoji together when a signal exists", () => {
    const motion = captionMotion(words, emojiTemplate, signal);
    expect(motion?.energy).toHaveLength(words.length);
    expect(motion?.emphasis).toEqual([2]);
    expect(motion?.wordsPerSec).toBe(2.5);
    expect(motion?.emoji).toEqual({ 2: "🔥" });
    expect(motion?.keywordColor).toBe(emojiTemplate?.keywordColor);
  });

  it("returns undefined when there is nothing to say, so style.motion stays unset", () => {
    expect(captionMotion(words, plainTemplate, null)).toBeUndefined();
    expect(captionMotion(words, null, null)).toBeUndefined();
  });

  it("adds no emoji for a template that does not ask for them", () => {
    expect(captionMotion(words, plainTemplate, signal)?.emoji).toBeUndefined();
  });

  it("produces a motion block the ASS builder actually burns in", () => {
    // End to end through the real builder: an emoji-only motion object (the
    // no-signal case) must still reach the subtitle file.
    const motion = captionMotion(words, emojiTemplate, null);
    const events = buildAnimatedEvents(
      words as { word: string; start: number; end: number }[],
      { highlight: "&H0000FFFF", base: "&H00FFFFFF" },
      motion,
    );
    expect(events).toContain("insane 🔥");
  });
});
