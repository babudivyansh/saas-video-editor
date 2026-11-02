import { describe, expect, it } from "vitest";
import { VOICE_SEED } from "@/lib/voices/catalog";
import { LIBRARY_VOICES } from "@/lib/voices/library";
import { VOICE_COUNT_LABEL, VOICE_LANGUAGE_COUNT } from "./stats";

describe("landing headline figures", () => {
  it("never claims more voices than the catalogue has", () => {
    const claimed = Number.parseInt(VOICE_COUNT_LABEL, 10);
    expect(VOICE_SEED.length + LIBRARY_VOICES.length).toBeGreaterThanOrEqual(claimed);
  });

  it("never claims more voice languages than the catalogue speaks", () => {
    const languages = new Set([...VOICE_SEED, ...LIBRARY_VOICES].flatMap((v) => v.languages ?? []));
    expect(languages.size).toBeGreaterThanOrEqual(VOICE_LANGUAGE_COUNT);
  });
});
