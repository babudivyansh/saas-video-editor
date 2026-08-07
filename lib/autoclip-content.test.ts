import { describe, expect, it, vi } from "vitest";

// Phase 4: content and distribution — caption templates and emoji, keyword-
// driven B-roll, translated captions, and URL import.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b", GEMINI_API_KEY: "k" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import { CAPTION_TEMPLATES, getCaptionTemplate, planEmoji } from "./caption-templates";
import { planBrollWindows, MAX_BROLL_WINDOWS, type BrollCue } from "./broll";
import { normaliseSpan, isSupportedCaptionLanguage } from "./caption-translate";
import { isAllowedSourceUrl } from "./url-import";
import { CAPTION_LANGUAGES, DUB_LANGUAGES, captionLanguageName } from "./languages";
import { buildAnimatedEvents } from "@/utils/ffmpeg-render";

describe("caption templates", () => {
  it("gives every template a distinct id", () => {
    const ids = CAPTION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a template by id and returns null for anything else", () => {
    expect(getCaptionTemplate("clean")?.label).toBe("Clean");
    expect(getCaptionTemplate("nope")).toBeNull();
    expect(getCaptionTemplate(null)).toBeNull();
  });

  it("uses ASS &HBBGGRR colours, not hex — the byte order is reversed", () => {
    for (const t of CAPTION_TEMPLATES) {
      for (const c of [t.style.baseColor, t.style.highlightColor, t.style.outlineColor]) {
        if (c) expect(c).toMatch(/^&H[0-9A-F]{8}$/i);
      }
    }
  });
});

describe("planEmoji", () => {
  const words = (list: string[]) => list.map((word) => ({ word }));

  it("places nothing when the template doesn't want emoji", () => {
    expect(planEmoji(words(["money", "fire"]), false)).toEqual({});
  });

  it("matches recognised whole words", () => {
    const plan = planEmoji(words(["make", "money", "fast"]), true);
    expect(plan[1]).toBe("💰");
  });

  // "assessment" must not match "ass". Substring matching here would be
  // actively embarrassing on a customer's video.
  it("never matches inside a longer word", () => {
    expect(planEmoji(words(["assessment", "association", "timeline"]), true)).toEqual({});
  });

  it("rate-limits so captions don't turn into confetti", () => {
    const many = words(new Array(120).fill("money"));
    const plan = planEmoji(many, true);
    expect(Object.keys(plan).length).toBeLessThanOrEqual(6);
  });

  it("spaces placements out rather than clustering them", () => {
    const plan = planEmoji(words(["money", "cash", "profit", "fire", "win"]), true);
    const indexes = Object.keys(plan).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i] - indexes[i - 1]).toBeGreaterThanOrEqual(8);
    }
  });

  it("renders the emoji alongside its word, never on its own line", () => {
    const w = [{ word: "make", start: 0, end: 300 }, { word: "money", start: 300, end: 700 }];
    const out = buildAnimatedEvents(w, { highlight: "&H0000FFFF", base: "&H00FFFFFF" }, { emoji: { 1: "💰" } });
    expect(out).toContain("money 💰");
  });
});

describe("keyword-driven B-roll", () => {
  const words = [
    { word: "welcome", start: 0, end: 500 },
    { word: "to", start: 500, end: 700 },
    { word: "the", start: 700, end: 900 },
    { word: "city", start: 9000, end: 9500 },
    { word: "and", start: 9500, end: 9800 },
    { word: "the", start: 9800, end: 10_000 },
    { word: "ocean", start: 18_000, end: 18_600 },
  ];
  const cues: BrollCue[] = [
    { word: "city", query: "city skyline" },
    { word: "ocean", query: "ocean waves" },
  ];

  it("lands the insert just after the word is spoken", () => {
    const [first] = planBrollWindows(cues, words, 30);
    // "city" ends at 9.5s; the cut follows it rather than covering it.
    expect(first.startSec).toBeGreaterThan(9.5);
    expect(first.startSec).toBeLessThan(10);
    expect(first.query).toBe("city skyline");
  });

  it("keeps the hook and the payoff clear", () => {
    const early: BrollCue[] = [{ word: "welcome", query: "intro" }];
    expect(planBrollWindows(early, words, 30)).toHaveLength(0);
  });

  it("won't place two inserts back to back", () => {
    const closeCues: BrollCue[] = [
      { word: "city", query: "a" },
      { word: "and", query: "b" },
    ];
    expect(planBrollWindows(closeCues, words, 30)).toHaveLength(1);
  });

  it("caps how many inserts one clip gets", () => {
    const many: BrollCue[] = words.map((w, i) => ({ word: w.word, query: `q${i}` }));
    expect(planBrollWindows(many, words, 300).length).toBeLessThanOrEqual(MAX_BROLL_WINDOWS);
  });

  it("ignores cues whose word isn't in the transcript", () => {
    expect(planBrollWindows([{ word: "spaceship", query: "rocket" }], words, 30)).toHaveLength(0);
  });

  it("returns nothing for a clip too short to cut away in", () => {
    expect(planBrollWindows(cues, words, 4)).toHaveLength(0);
  });

  it("returns windows in chronological order", () => {
    const out = planBrollWindows(cues, words, 40);
    for (let i = 1; i < out.length; i++) expect(out[i].startSec).toBeGreaterThan(out[i - 1].startSec);
  });
});

describe("caption translation", () => {
  it("keeps translated words inside the original time span", () => {
    const out = normaliseSpan(
      [{ word: "hola", start: -500, end: 99_999 }],
      1000, 2000,
    );
    expect(out[0].start).toBeGreaterThanOrEqual(1000);
    expect(out[0].end).toBeLessThanOrEqual(2000);
  });

  // Word counts rarely survive translation, so a fixed mapping is impossible;
  // an even spread across the same span is still perfectly readable.
  it("distributes evenly when the model returns incoherent timings", () => {
    const out = normaliseSpan(
      [
        { word: "a", start: 900, end: 100 },
        { word: "b", start: 50, end: 20 },
        { word: "c", start: NaN, end: NaN },
      ],
      0, 3000,
    );
    expect(out).toHaveLength(3);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start);
    expect(out[out.length - 1].end).toBeLessThanOrEqual(3000);
  });

  it("drops empty words rather than emitting blank captions", () => {
    expect(normaliseSpan([{ word: "   ", start: 0, end: 100 }], 0, 1000)).toHaveLength(0);
  });
});

describe("language lists", () => {
  it("offers captions in at least every language dubbing supports", () => {
    for (const dub of DUB_LANGUAGES) {
      expect(CAPTION_LANGUAGES.some((c) => c.code === dub.code)).toBe(true);
    }
  });

  it("has no duplicate codes after merging the previously separate lists", () => {
    const codes = CAPTION_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("resolves a display name, falling back to the code", () => {
    expect(captionLanguageName("es")).toBe("Spanish");
    expect(captionLanguageName("xx")).toBe("xx");
  });

  it("validates supported languages", () => {
    expect(isSupportedCaptionLanguage("es")).toBe(true);
    expect(isSupportedCaptionLanguage("klingon")).toBe(false);
  });
});

describe("URL import allowlist", () => {
  it("accepts the supported hosts", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
      "https://vimeo.com/123",
      "https://drive.google.com/file/d/x/view",
      "https://www.loom.com/share/x",
    ]) {
      expect(isAllowedSourceUrl(url), url).toBe(true);
    }
  });

  // This fetches a URL server-side, so an open allowlist is an SSRF
  // primitive — cloud metadata endpoints being the classic target.
  it("rejects internal and metadata addresses", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "https://localhost/admin",
      "https://127.0.0.1:8080/",
      "http://192.168.1.1/",
      "file:///etc/passwd",
    ]) {
      expect(isAllowedSourceUrl(url), url).toBe(false);
    }
  });

  it("rejects plain http even on an allowed host", () => {
    expect(isAllowedSourceUrl("http://www.youtube.com/watch?v=abc")).toBe(false);
  });

  it("rejects a lookalike host", () => {
    expect(isAllowedSourceUrl("https://youtube.com.evil.test/watch?v=a")).toBe(false);
    expect(isAllowedSourceUrl("https://notyoutube.com/watch?v=a")).toBe(false);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(isAllowedSourceUrl("not a url")).toBe(false);
    expect(isAllowedSourceUrl("")).toBe(false);
  });
});
