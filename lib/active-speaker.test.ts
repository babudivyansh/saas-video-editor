import { describe, expect, it } from "vitest";
import { assignSpeaking, buildTurns, mapTracksToSpeakers, speakerAt, SPEAKING_NO, SPEAKING_YES } from "./active-speaker";
import type { FaceBox } from "./reframe";

/** Words in ms for one speaker, one word every 300 ms. */
function say(speaker: string, fromSec: number, toSec: number) {
  const out = [];
  for (let t = fromSec * 1000; t < toSec * 1000 - 200; t += 300) out.push({ word: "w", start: t, end: t + 250, speaker });
  return out;
}

/**
 * A two-shot sampled at 4 fps: host on the right, guest on the left. Whoever
 * talks has a moving mouth (motion 0.25), the listener a still one (0.08).
 */
function twoShot(talker: (t: number) => "host" | "guest" | null, from: number, to: number): FaceBox[] {
  const out: FaceBox[] = [];
  for (let t = from; t < to; t += 0.25) {
    const who = talker(t);
    out.push({ tSec: t, x: 0.68, y: 0.2, w: 0.1, h: 0.2, confidence: 90, trackId: "host", mouthMotion: who === "host" ? 0.25 : 0.08 });
    out.push({ tSec: t, x: 0.2, y: 0.2, w: 0.08, h: 0.18, confidence: 90, trackId: "guest", mouthMotion: who === "guest" ? 0.25 : 0.08 });
  }
  return out;
}

describe("buildTurns", () => {
  it("folds a one-word backchannel into the surrounding turn", () => {
    const words = [...say("A", 0, 5), { word: "yeah", start: 5100, end: 5400, speaker: "B" }, ...say("A", 5.5, 10)];
    const turns = buildTurns(words);
    expect(turns).toHaveLength(1);
    expect(turns[0].speaker).toBe("A");
  });

  it("folds a leading 'yeah' into the next turn after a silence", () => {
    const words = [...say("A", 0, 3), { word: "yeah", start: 20000, end: 20300, speaker: "B" }, ...say("A", 20.4, 25)];
    expect(buildTurns(words).map((t) => t.speaker)).toEqual(["A", "A"]);
  });

  it("keeps real turns", () => {
    const turns = buildTurns([...say("A", 0, 4), ...say("B", 4.2, 8), ...say("A", 8.2, 12)]);
    expect(turns.map((t) => t.speaker)).toEqual(["A", "B", "A"]);
    expect(speakerAt(turns, 6)).toBe("B");
    expect(speakerAt(turns, 30)).toBeNull();
  });
});

describe("mapTracksToSpeakers", () => {
  it("maps each face to the voice its mouth moves with", () => {
    const faces = twoShot((t) => (t < 5 ? "host" : "guest"), 0, 10);
    const turns = buildTurns([...say("speaker_0", 0, 5), ...say("speaker_1", 5, 10)]);
    const map = mapTracksToSpeakers(faces, turns);
    expect(map.get("host")).toBe("speaker_0");
    expect(map.get("guest")).toBe("speaker_1");
  });

  it("gives a voice to the clearer face when only one person talks through the shot", () => {
    const faces = twoShot(() => "host", 0, 10);
    const map = mapTracksToSpeakers(faces, buildTurns(say("speaker_0", 0, 10)));
    expect(map.get("host")).toBe("speaker_0");
    expect(map.has("guest")).toBe(false);
  });
});

describe("assignSpeaking", () => {
  it("marks the talker in each two-face moment from the transcript", () => {
    const faces = twoShot((t) => (t < 5 ? "host" : "guest"), 0, 10);
    const words = [...say("speaker_0", 0, 5), ...say("speaker_1", 5, 10)];
    const out = assignSpeaking(faces, words);
    const at = (t: number, id: string) => out.find((f) => f.tSec === t && f.trackId === id)!.speaking;
    expect(at(2, "host")).toBe(SPEAKING_YES);
    expect(at(2, "guest")).toBe(SPEAKING_NO);
    expect(at(7, "guest")).toBe(SPEAKING_YES);
    expect(at(7, "host")).toBe(SPEAKING_NO);
  });

  it("leaves a face alone on screen without a score", () => {
    const solo: FaceBox[] = [0, 0.25, 0.5].map((tSec) => ({ tSec, x: 0.5, y: 0.2, w: 0.1, h: 0.2, confidence: 90, trackId: "a", mouthMotion: 0.2 }));
    expect(assignSpeaking(solo, say("speaker_0", 0, 1)).every((f) => f.speaking === undefined)).toBe(true);
  });

  it("gives no signal without a transcript, rather than calling everyone silent", () => {
    const faces = twoShot(() => "host", 0, 5);
    expect(assignSpeaking(faces, []).every((f) => f.speaking === undefined)).toBe(true);
    expect(assignSpeaking(faces, null)).toBe(faces);
  });

  it("leaves timelines without mouth movement (Gemini, Rekognition) untouched", () => {
    const faces = twoShot(() => "host", 0, 5).map(({ mouthMotion: _m, ...f }) => (void _m, f));
    expect(assignSpeaking(faces, say("speaker_0", 0, 5))).toBe(faces);
  });

  it("falls back to mouth movement when the transcript has no speaker labels", () => {
    const faces = twoShot(() => "guest", 0, 5);
    const words = say("x", 0, 5).map(({ speaker: _s, ...w }) => (void _s, w));
    const out = assignSpeaking(faces, words);
    const g = out.find((f) => f.tSec === 2 && f.trackId === "guest")!;
    const h = out.find((f) => f.tSec === 2 && f.trackId === "host")!;
    expect(g.speaking!).toBeGreaterThan(h.speaking!);
  });
});
