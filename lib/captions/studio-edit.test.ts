import { describe, expect, it } from "vitest";
import { validateDoc, type CaptionClip, type TimelineDoc } from "@/lib/editor/types";
import { countMatches, cueAt, deleteCue, mergeWithNext, replaceAll, splitCue, styleMatching, updateWord } from "./studio-edit";

const cue = (id: string, start: number, words: [string, number, number][]): CaptionClip => ({
  type: "caption", id, timelineStart: start, duration: 2, text: words.map((w) => w[0]).join(" "),
  words: words.map(([word, startMs, endMs]) => ({ word, startMs, endMs })), templateId: "clean",
  fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.85, highlightMode: "none",
});

function doc(): TimelineDoc {
  return {
    version: 1, aspect: "9:16", fps: 30,
    tracks: {
      video: [{ id: "v", type: "video", assetId: "a1", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false }],
      text: [], audio: [], image: [],
      caption: [
        cue("c1", 0, [["And", 0, 300], ["honestly,", 300, 800], ["I", 800, 950], ["almost", 950, 1400], ["quit", 1400, 1900]]),
        cue("c2", 2.5, [["clipero", 0, 500], ["saved", 500, 900], ["my", 900, 1100], ["week.", 1100, 1600]]),
      ],
    },
  };
}

const words = (d: TimelineDoc, i: number) => d.tracks.caption[i]!.words!.map((w) => w.word);

describe("updateWord", () => {
  it("retypes a word and keeps the line's text in step", () => {
    const d = updateWord(doc(), "c1", 4, { word: "quit!" });
    expect(words(d, 0)).toEqual(["And", "honestly,", "I", "almost", "quit!"]);
    expect(d.tracks.caption[0]!.text).toBe("And honestly, I almost quit!");
  });

  it("removes a word emptied out", () => {
    const d = updateWord(doc(), "c1", 0, { word: "  " });
    expect(words(d, 0)).toEqual(["honestly,", "I", "almost", "quit"]);
    expect(validateDoc(d)).toBeNull();
  });

  it("merges and clears style fields", () => {
    let d = updateWord(doc(), "c1", 4, { style: { color: "#FF4FA3", emphasis: "bigger" } });
    expect(d.tracks.caption[0]!.words![4]!.style).toEqual({ color: "#FF4FA3", emphasis: "bigger" });
    d = updateWord(d, "c1", 4, { style: { emphasis: undefined } });
    expect(d.tracks.caption[0]!.words![4]!.style).toEqual({ color: "#FF4FA3" });
    d = updateWord(d, "c1", 4, { style: { color: undefined } });
    expect("style" in d.tracks.caption[0]!.words![4]!).toBe(false);
    expect(validateDoc(d)).toBeNull();
  });

  it("keeps timing between the neighbours and inside the line", () => {
    const d = updateWord(doc(), "c1", 3, { startMs: 100, endMs: 5000 });
    expect(d.tracks.caption[0]!.words![3]).toMatchObject({ startMs: 950, endMs: 1400 });
    const last = updateWord(doc(), "c1", 4, { endMs: 9999 });
    expect(last.tracks.caption[0]!.words![4]!.endMs).toBe(2000);
    const short = updateWord(doc(), "c1", 2, { endMs: 0 });
    expect(short.tracks.caption[0]!.words![2]!.endMs).toBe(840);
  });
});

describe("splitting and merging lines", () => {
  it("splits before a word, the new line starting where it starts", () => {
    const d = splitCue(doc(), "c1", 3);
    expect(d.tracks.caption).toHaveLength(3);
    const [a, b] = d.tracks.caption;
    expect(words(d, 0)).toEqual(["And", "honestly,", "I"]);
    expect(a!.duration).toBeCloseTo(0.95);
    expect(b!.timelineStart).toBeCloseTo(0.95);
    expect(b!.words).toEqual([{ word: "almost", startMs: 0, endMs: 450 }, { word: "quit", startMs: 450, endMs: 950 }]);
    expect(b!.id).not.toBe("c1");
    expect(validateDoc(d)).toBeNull();
  });

  it("ignores a split at either end", () => {
    expect(splitCue(doc(), "c1", 0)).toEqual(doc());
    expect(splitCue(doc(), "c1", 5)).toEqual(doc());
  });

  it("merges a line with the next, across the gap", () => {
    const d = mergeWithNext(doc(), "c1");
    expect(d.tracks.caption).toHaveLength(1);
    const m = d.tracks.caption[0]!;
    expect(m.duration).toBeCloseTo(4.5);
    expect(m.words!.slice(5)[0]).toEqual({ word: "clipero", startMs: 2500, endMs: 3000 });
    expect(m.text).toBe("And honestly, I almost quit clipero saved my week.");
    expect(validateDoc(d)).toBeNull();
    expect(mergeWithNext(doc(), "c2")).toEqual(doc());
  });

  it("splits then merges back to the same words and times", () => {
    const back = mergeWithNext(splitCue(doc(), "c1", 2), "c1");
    expect(back.tracks.caption[0]!.words).toEqual(doc().tracks.caption[0]!.words);
  });

  it("deletes a line", () => {
    expect(deleteCue(doc(), "c1").tracks.caption.map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("find and replace", () => {
  it("replaces whole words, keeping punctuation, timing and style", () => {
    const styled = updateWord(doc(), "c2", 0, { style: { color: "#20D68A" } });
    const { doc: d, count } = replaceAll(styled, "Clipero", "Clipiro");
    expect(count).toBe(1);
    expect(d.tracks.caption[1]!.words![0]).toEqual({ word: "Clipiro", startMs: 0, endMs: 500, style: { color: "#20D68A" } });
    expect(d.tracks.caption[1]!.text).toBe("Clipiro saved my week.");
    expect(replaceAll(doc(), "honestly", "frankly").doc.tracks.caption[0]!.words![1]!.word).toBe("frankly,");
    expect(replaceAll(doc(), "almo", "x").count).toBe(0);
  });

  it("respects case when asked", () => {
    expect(countMatches(doc(), "and")).toBe(1);
    expect(countMatches(doc(), "and", true)).toBe(0);
  });

  it("styles every copy of a word", () => {
    const twice = replaceAll(doc(), "my", "quit").doc;
    const { doc: d, count } = styleMatching(twice, "QUIT", { emphasis: "box" });
    expect(count).toBe(2);
    expect(d.tracks.caption[0]!.words![4]!.style).toEqual({ emphasis: "box" });
    expect(d.tracks.caption[1]!.words![2]!.style).toEqual({ emphasis: "box" });
  });
});

describe("cueAt", () => {
  it("finds the spoken line and word", () => {
    expect(cueAt(doc(), 1000)).toEqual({ cueId: "c1", index: 3 });
    expect(cueAt(doc(), 3100)).toEqual({ cueId: "c2", index: 1 });
    expect(cueAt(doc(), 2200)).toBeNull();
  });
});
