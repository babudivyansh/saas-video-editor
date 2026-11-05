import { describe, expect, it } from "vitest";
import { demucsStems, INSTRUMENTAL_STEMS } from "./demucs";

// fal's Demucs output is one { url } per stem; there is no "accompaniment".
// The vocal remover used to read that field and could never have succeeded.

describe("demucsStems", () => {
  it("takes the non-vocal stems for the instrumental and the vocals on their own", () => {
    expect(demucsStems({
      vocals: { url: "https://f/v.mp3" },
      drums: { url: "https://f/d.mp3" },
      bass: { url: "https://f/b.mp3" },
      other: { url: "https://f/o.mp3" },
    })).toEqual({ instrumental: ["https://f/d.mp3", "https://f/b.mp3", "https://f/o.mp3"], vocals: "https://f/v.mp3" });
  });

  it("mixes whichever instrumental stems came back", () => {
    expect(demucsStems({ drums: null, bass: { url: "https://f/b.mp3" }, other: { url: "https://f/o.mp3" } }))
      .toEqual({ instrumental: ["https://f/b.mp3", "https://f/o.mp3"], vocals: null });
  });

  it("throws when there is nothing to make an instrumental from", () => {
    expect(() => demucsStems({ vocals: { url: "https://f/v.mp3" } })).toThrow(/No instrumental stems/);
    expect(() => demucsStems({ accompaniment: { url: "https://f/a.mp3" } })).toThrow(/No instrumental stems/);
    expect(() => demucsStems(null)).toThrow(/No instrumental stems/);
  });

  it("asks for drums, bass and other", () => {
    expect(INSTRUMENTAL_STEMS).toEqual(["drums", "bass", "other"]);
  });
});
