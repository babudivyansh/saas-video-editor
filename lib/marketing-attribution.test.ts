import { describe, expect, it } from "vitest";
import { buildAttributionCookie, parseAttributionCookie } from "./marketing-attribution";

describe("buildAttributionCookie", () => {
  it("joins the three values", () => {
    expect(buildAttributionCookie("newsletter", "email", "launch")).toBe("newsletter|email|launch");
  });

  it("returns null when nothing survives normalization, so no cookie is set", () => {
    expect(buildAttributionCookie(null, null, null)).toBeNull();
    expect(buildAttributionCookie("", "", "")).toBeNull();
    expect(buildAttributionCookie("<script>", "  ", "!!")).toBeNull();
  });

  it("keeps a partial tuple", () => {
    expect(buildAttributionCookie("twitter", null, null)).toBe("twitter||");
  });

  it("lowercases", () => {
    expect(buildAttributionCookie("Twitter", "CPC", null)).toBe("twitter|cpc|");
  });

  // These values are attacker-controlled and end up in a unique index, so
  // anything that isn't a short, boring token has to be dropped.
  it("drops values that are too long rather than truncating into a new distinct value", () => {
    expect(buildAttributionCookie("a".repeat(33), null, null)).toBeNull();
  });

  it("drops values containing the field separator", () => {
    expect(buildAttributionCookie("a|b", null, null)).toBeNull();
  });

  it("drops values with punctuation, spaces, or markup", () => {
    for (const bad of ["a b", "a.b", "a/b", "<img>", "a'b", "a;b"]) {
      expect(buildAttributionCookie(bad, null, null)).toBeNull();
    }
  });
});

describe("parseAttributionCookie", () => {
  it("round-trips a value built by buildAttributionCookie", () => {
    const raw = buildAttributionCookie("newsletter", "email", "launch")!;
    expect(parseAttributionCookie(raw)).toEqual({ source: "newsletter", medium: "email", campaign: "launch" });
  });

  it("returns null for absent or empty input", () => {
    expect(parseAttributionCookie(null)).toBeNull();
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(parseAttributionCookie("")).toBeNull();
    expect(parseAttributionCookie("||")).toBeNull();
  });

  // A cookie is user-editable. Attribution is best-effort metadata and must
  // never be able to fail a registration.
  it("tolerates malformed input without throwing", () => {
    expect(() => parseAttributionCookie("garbage")).not.toThrow();
    expect(() => parseAttributionCookie("a|b|c|d|e")).not.toThrow();
    expect(() => parseAttributionCookie("|".repeat(500))).not.toThrow();
  });

  it("strips injected junk from a hand-edited cookie", () => {
    expect(parseAttributionCookie("<script>|email|launch")).toEqual({
      source: "",
      medium: "email",
      campaign: "launch",
    });
  });

  it("returns null when every field is junk", () => {
    expect(parseAttributionCookie("<a>|<b>|<c>")).toBeNull();
  });
});
