import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  clipGrades,
  isEditedClip,
  letterGrade,
  matchesFilters,
  parseFilters,
  transcriptExcerpt,
  type FilterableClip,
} from "./clip-view";

describe("letterGrade", () => {
  it.each([
    [99, "A"], [90, "A"], [89, "A-"], [85, "A-"], [84, "B+"], [80, "B+"], [79, "B"],
    [75, "B"], [74, "B-"], [70, "B-"], [69, "C+"], [65, "C+"], [64, "C"], [60, "C"], [59, "D"], [0, "D"],
  ])("%i → %s", (n, g) => expect(letterGrade(n)).toBe(g));

  it("has no grade for a missing score", () => {
    expect(letterGrade(null)).toBeNull();
    expect(letterGrade(undefined)).toBeNull();
    expect(letterGrade(Number.NaN)).toBeNull();
  });
});

describe("clipGrades", () => {
  it("maps pacing, payoff and engagement onto Flow, Value and Trend", () => {
    expect(clipGrades({ hook: 91, pacing: 86, payoff: 76, engagement: 50 })).toEqual({
      hook: "A", flow: "A-", value: "B", trend: "D",
    });
  });

  it("is null when there's no breakdown at all", () => {
    expect(clipGrades(null)).toBeNull();
    expect(clipGrades({})).toBeNull();
  });
});

describe("transcriptExcerpt", () => {
  const words = (s: string) => s.split(" ").map((word, i) => ({ word, start: i * 100, end: i * 100 + 90 }));

  it("joins the words", () => {
    expect(transcriptExcerpt(words("and then uh during the hurricane"))).toBe("and then uh during the hurricane");
  });

  it("cuts at a word boundary with an ellipsis", () => {
    expect(transcriptExcerpt(words("one two three four"), 9)).toBe("one two…");
  });

  it("is null for no transcript", () => {
    expect(transcriptExcerpt(null)).toBeNull();
    expect(transcriptExcerpt([])).toBeNull();
    expect(transcriptExcerpt("not words")).toBeNull();
  });
});

describe("isEditedClip", () => {
  it("counts a re-render or a lite edit, nothing else", () => {
    expect(isEditedClip({ rerenderCount: 0, liteEdits: null })).toBe(false);
    expect(isEditedClip({ rerenderCount: 1, liteEdits: null })).toBe(true);
    expect(isEditedClip({ rerenderCount: 0, liteEdits: { trims: [] } })).toBe(true);
  });
});

describe("matchesFilters", () => {
  const clip = (over: Partial<FilterableClip> = {}): FilterableClip => ({
    durationSec: 45, isFavorite: false, isDisliked: false, edited: false, dubbed: false, ...over,
  });
  const none = { flags: [], lengths: [] };

  it("passes everything with no filters", () => {
    expect(matchesFilters(clip(), none)).toBe(true);
  });

  it("narrows on every ticked flag", () => {
    const f = { flags: ["favorited" as const, "dubbed" as const], lengths: [] };
    expect(matchesFilters(clip({ isFavorite: true, dubbed: true }), f)).toBe(true);
    expect(matchesFilters(clip({ isFavorite: true }), f)).toBe(false);
  });

  it("splits dubbed from not dubbed", () => {
    expect(matchesFilters(clip({ dubbed: false }), { flags: ["notDubbed"], lengths: [] })).toBe(true);
    expect(matchesFilters(clip({ dubbed: true }), { flags: ["notDubbed"], lengths: [] })).toBe(false);
  });

  it("widens across ticked lengths, with the lower bound inclusive", () => {
    const f = { flags: [], lengths: ["lt30" as const, "60to90" as const] };
    expect(matchesFilters(clip({ durationSec: 12 }), f)).toBe(true);
    expect(matchesFilters(clip({ durationSec: 60 }), f)).toBe(true);
    expect(matchesFilters(clip({ durationSec: 45 }), f)).toBe(false);
    expect(matchesFilters(clip({ durationSec: 90 }), f)).toBe(false);
    expect(matchesFilters(clip({ durationSec: 90 }), { flags: [], lengths: ["gt90"] })).toBe(true);
  });
});

describe("parseFilters", () => {
  it("reads the URL and drops unknown values", () => {
    const p = new URLSearchParams("f=favorited,bogus,edited&len=60to90,999");
    const f = parseFilters(p);
    expect(f).toEqual({ flags: ["favorited", "edited"], lengths: ["60to90"] });
    expect(activeFilterCount(f)).toBe(3);
  });

  it("is empty when there's nothing in the URL", () => {
    expect(parseFilters(new URLSearchParams(""))).toEqual({ flags: [], lengths: [] });
  });
});
