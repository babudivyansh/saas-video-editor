import type { EditorVoice } from "@clipiro/shared";
import { voiceLanguages, voicesFor } from "../voiceLanguages";

const v = (id: string, language: string | null, languageLabel: string | null = null): EditorVoice => ({
  id, name: id, description: null, gender: "female", accent: null, previewUrl: null, creditMultiplier: 1, language, languageLabel,
});

const voices = [v("brian", null), v("zara", "hi", "Hindi"), v("lucia", "es", "Spanish"), v("clone:1", null), v("sia", "hi", "Hindi")];

describe("voice language filter", () => {
  it("lists only languages with voices of their own, alphabetically", () => {
    expect(voiceLanguages(voices)).toEqual([{ code: "hi", label: "Hindi" }, { code: "es", label: "Spanish" }]);
  });

  it("puts a language's own voices first, then the multilingual ones", () => {
    expect(voicesFor(voices, "hi").map((x) => x.id)).toEqual(["zara", "sia", "brian", "clone:1"]);
  });

  it("shows everything with no language picked", () => {
    expect(voicesFor(voices, null)).toHaveLength(voices.length);
  });
});
