import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@google/generative-ai", () => ({
  // A class, not an arrow — the module calls `new GoogleGenerativeAI(...)`.
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: vi.fn() };
    }
  },
}));

const { normalizeHook, generateHookCandidates, MAX_HOOK_CHARS } = await import("./hooks");

describe("normalizeHook", () => {
  it("strips the quotes models wrap around a hook even when told not to", () => {
    expect(normalizeHook('"You are doing this wrong"')).toBe("You are doing this wrong");
    expect(normalizeHook("'Stop scrolling'")).toBe("Stop scrolling");
    expect(normalizeHook("`Backticks too`")).toBe("Backticks too");
  });

  it("flattens newlines and collapses runs of whitespace", () => {
    expect(normalizeHook("two\nlines   here")).toBe("two lines here");
  });

  it("truncates to the cap, since a long hook stops being a hook", () => {
    expect(normalizeHook("x".repeat(200))).toHaveLength(MAX_HOOK_CHARS);
  });

  it("rejects anything too short or not a string to be a real hook", () => {
    expect(normalizeHook("")).toBeNull();
    expect(normalizeHook("ab")).toBeNull();
    expect(normalizeHook('"  "')).toBeNull();
    expect(normalizeHook(42)).toBeNull();
    expect(normalizeHook(null)).toBeNull();
  });
});

describe("generateHookCandidates", () => {
  it("returns [] with no transcript rather than calling the model", async () => {
    expect(await generateHookCandidates([])).toEqual([]);
  });

  it("returns [] when Gemini is unconfigured — a hook is an enhancement, not a requirement", async () => {
    // The caller renders a manual text box for [], so an unconfigured model
    // degrades to "type your own" rather than failing the render.
    expect(await generateHookCandidates([{ word: "hello", start: 0, end: 100 }])).toEqual([]);
  });
});
