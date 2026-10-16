import { describe, expect, it } from "vitest";
import { realignWords } from "./caption-words";

const w = (word: string, startMs: number, endMs: number) => ({ word, startMs, endMs });

describe("realignWords", () => {
  const words = [w("So", 0, 200), w("um", 200, 400), w("this", 400, 600), w("is,", 600, 800), w("like,", 800, 1000), w("great", 1000, 1400)];

  it("drops removed words and keeps the timing of the rest", () => {
    expect(realignWords(words, "So this is, great")).toEqual([w("So", 0, 200), w("this", 400, 600), w("is,", 600, 800), w("great", 1000, 1400)]);
  });

  it("glues a new token (an emoji) onto the word before it", () => {
    expect(realignWords(words, "So um this is, like, great 🔥")?.at(-1)).toEqual(w("great 🔥", 1000, 1400));
  });

  it("matches regardless of case and punctuation", () => {
    expect(realignWords([w("hello", 0, 100), w("world", 100, 200)], "Hello, WORLD!")).toEqual([w("Hello,", 0, 100), w("WORLD!", 100, 200)]);
  });

  it("leaves cues without word timings alone", () => {
    expect(realignWords(undefined, "anything")).toBeUndefined();
  });
});
