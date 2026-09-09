import { describe, it, expect } from "vitest";
import {
  fromProviderWords,
  toProviderWords,
  fromWordTimings,
  toWordTimings,
  mergeProviderWords,
} from "./words";
import type { WordTiming } from "@/utils/elevenlabs";

describe("fromProviderWords", () => {
  it("accepts either field naming, since the provider's shape is unverified", () => {
    const out = fromProviderWords([
      { text: "hello", startTime: 0, endTime: 500 },
      { word: "world", start: 500, end: 900 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["hello", "world"]);
    expect(out[1]).toMatchObject({ startTime: 500, endTime: 900 });
  });

  it("infers the token type when the provider omits it", () => {
    const out = fromProviderWords([
      { text: "hi", startTime: 0, endTime: 100 },
      { text: ",", startTime: 100, endTime: 110 },
      { text: "", startTime: 110, endTime: 400 },
    ]);
    expect(out.map((w) => w.type)).toEqual(["word", "punctuation", "silence"]);
  });

  it("drops tokens with unusable timing rather than inventing one", () => {
    // A fabricated timestamp desynchronises everything after it, which is far
    // worse than one missing token.
    const out = fromProviderWords([
      { text: "keep", startTime: 0, endTime: 100 },
      { text: "drop", startTime: undefined, endTime: 200 },
      { text: "drop2", start: -1, end: 300 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["keep"]);
  });

  it("re-sorts chronologically — a provider may return edits out of order", () => {
    const out = fromProviderWords([
      { text: "third", startTime: 900, endTime: 1000 },
      { text: "first", startTime: 0, endTime: 100 },
      { text: "second", startTime: 100, endTime: 200 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["first", "second", "third"]);
  });

  it("sanitizes ASS override syntax out of provider text", () => {
    // These end up in a subtitle file if the render falls back to native.
    const out = fromProviderWords([{ text: "{\\p1}draw", startTime: 0, endTime: 10 }]);
    expect(out[0].text).toBe("p1draw");
  });

  it("clamps an inverted range instead of producing a negative duration", () => {
    const out = fromProviderWords([{ text: "x", startTime: 500, endTime: 100 }]);
    expect(out[0].endTime).toBe(500);
  });

  it("returns [] for a missing or non-array payload", () => {
    expect(fromProviderWords(undefined)).toEqual([]);
    expect(fromProviderWords([])).toEqual([]);
  });
});

describe("toProviderWords", () => {
  it("round-trips a provider word list unchanged", () => {
    const original = [
      { id: "w1", text: "hello", type: "word" as const, startTime: 0, endTime: 500 },
      { id: "w2", text: ",", type: "punctuation" as const, startTime: 500, endTime: 510 },
    ];
    expect(toProviderWords(fromProviderWords(original))).toEqual(original);
  });

  it("omits the id entirely when there isn't one", () => {
    const out = toProviderWords([{ text: "hi", type: "word", startTime: 0, endTime: 1 }]);
    expect(out[0]).not.toHaveProperty("id");
  });
});

describe("fromWordTimings / toWordTimings", () => {
  const canonical: WordTiming[] = [
    { word: "hello", start: 0, end: 500 },
    { word: "world", start: 500, end: 900 },
  ];

  it("round-trips Clipiro's canonical transcript", () => {
    expect(toWordTimings(fromWordTimings(canonical))).toEqual(canonical);
  });

  it("folds punctuation into the preceding word rather than emitting a token", () => {
    // WordTiming feeds the ASS renderer, where a standalone "," would be laid
    // out and karaoke-highlighted as if it were a spoken word.
    const out = toWordTimings([
      { text: "hello", type: "word", startTime: 0, endTime: 500 },
      { text: ",", type: "punctuation", startTime: 500, endTime: 520 },
      { text: "world", type: "word", startTime: 520, endTime: 900 },
    ]);
    expect(out).toEqual([
      { word: "hello,", start: 0, end: 520 },
      { word: "world", start: 520, end: 900 },
    ]);
  });

  it("drops silence tokens", () => {
    const out = toWordTimings([
      { text: "hi", type: "word", startTime: 0, endTime: 100 },
      { text: "", type: "silence", startTime: 100, endTime: 900 },
    ]);
    expect(out).toEqual([{ word: "hi", start: 0, end: 100 }]);
  });

  it("keeps leading punctuation that has nothing to attach to", () => {
    const out = toWordTimings([{ text: "-", type: "punctuation", startTime: 0, endTime: 10 }]);
    expect(out).toEqual([{ word: "-", start: 0, end: 10 }]);
  });
});

describe("mergeProviderWords", () => {
  const canonical: WordTiming[] = [
    { word: "hello", start: 0, end: 500 },
    { word: "world", start: 500, end: 900 },
  ];

  it("keeps OUR words and timings, taking only the provider's ids", () => {
    // Clipiro's transcript is canonical and may already carry user
    // corrections — the provider's contribution is its token ids.
    const provider = [
      { id: "p1", text: "helo", type: "word" as const, startTime: 10, endTime: 480 },
      { id: "p2", text: "wrld", type: "word" as const, startTime: 480, endTime: 880 },
    ];
    const merged = mergeProviderWords(canonical, provider);
    expect(merged.map((w) => w.text)).toEqual(["hello", "world"]);
    expect(merged.map((w) => w.startTime)).toEqual([0, 500]);
    expect(merged.map((w) => w.id)).toEqual(["p1", "p2"]);
  });

  it("ignores punctuation when aligning, so token counts still match", () => {
    const provider = [
      { id: "p1", text: "hello", type: "word" as const, startTime: 0, endTime: 500 },
      { id: "px", text: ",", type: "punctuation" as const, startTime: 500, endTime: 510 },
      { id: "p2", text: "world", type: "word" as const, startTime: 510, endTime: 900 },
    ];
    expect(mergeProviderWords(canonical, provider).map((w) => w.id)).toEqual(["p1", "p2"]);
  });

  it("refuses to guess an alignment when the counts diverge", () => {
    // A wrong alignment silently retimes captions, which is worse than having
    // no provider ids — so we keep ours and attach nothing.
    const provider = [{ id: "p1", text: "hello", type: "word" as const, startTime: 0, endTime: 500 }];
    const merged = mergeProviderWords(canonical, provider);
    expect(merged.map((w) => w.text)).toEqual(["hello", "world"]);
    expect(merged.every((w) => w.id === undefined)).toBe(true);
  });

  it("adopts the provider transcript only when we have none", () => {
    const provider = [{ id: "p1", text: "hello", type: "word" as const, startTime: 0, endTime: 500 }];
    expect(mergeProviderWords([], provider)).toEqual(provider);
  });
});
