// @vitest-environment node
import { describe, it, expect } from "vitest";
import { captionMotion } from "./caption-motion";
import { getCaptionTemplate } from "./caption-templates";
import { buildCaptionTrack } from "@/lib/captions/engine";
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

const emojiTemplate = getCaptionTemplate("boardroom"); // emoji above keywords
const plainTemplate = getCaptionTemplate("clean");     // no emoji

describe("captionMotion", () => {
  it("places emoji when there is NO signal track at all", () => {
    // Emoji come from the template, not from the audio, so a clip with no
    // signal track still gets them.
    const motion = captionMotion(words, emojiTemplate, null);
    expect(motion.emoji).toEqual({ 2: "🔥" });
    expect(motion.energy).toBeUndefined();
  });

  it("places emoji when the signal track exists but is empty", () => {
    const empty = { ...signal, energy: [] } as unknown as SignalTrack;
    expect(captionMotion(words, emojiTemplate, empty).emoji).toEqual({ 2: "🔥" });
  });

  it("carries energy, emphasis and emoji together when a signal exists", () => {
    const motion = captionMotion(words, emojiTemplate, signal);
    expect(motion.energy).toHaveLength(words.length);
    expect(motion.emphasis).toEqual([2]);
    expect(motion.wordsPerSec).toBe(2.5);
    expect(motion.emoji).toEqual({ 2: "🔥" });
  });

  it("adds no emoji for a template that does not ask for them, or for no template", () => {
    expect(captionMotion(words, plainTemplate, signal).emoji).toEqual({});
    expect(captionMotion(words, null, null).emoji).toEqual({});
  });

  it("produces emoji the engine actually overlays", () => {
    const motion = captionMotion(words, emojiTemplate, null);
    const track = buildCaptionTrack({ words, template: emojiTemplate!, W: 1080, H: 1920, emoji: motion.emoji });
    expect(track.emoji.map((e) => e.file)).toEqual(["emoji_u1f525.png"]);
  });
});
