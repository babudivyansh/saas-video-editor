import { describe, it, expect } from "vitest";
import {
  templateIdForIndex,
  indexForTemplateId,
  INDEX_TO_TEMPLATE,
  TEMPLATE_TO_INDEX,
  DEFAULT_TEMPLATE_ID,
} from "./legacyStyleIndex";
import { CAPTION_TEMPLATES } from "@/lib/caption-templates";

describe("templateIdForIndex", () => {
  it("covers every legacy index 0-15", () => {
    // The old grid had exactly 16 entries. A gap here means some production
    // clip maps to the fallback instead of the look its owner chose.
    for (let i = 0; i <= 15; i++) {
      expect(INDEX_TO_TEMPLATE[i], `index ${i} unmapped`).toBeTruthy();
    }
    expect(Object.keys(INDEX_TO_TEMPLATE)).toHaveLength(16);
  });

  it("only ever maps to templates that actually exist", () => {
    // A slug typo here would silently produce clips with no resolvable style.
    const known = new Set(CAPTION_TEMPLATES.map((t) => t.id));
    for (const [index, slug] of Object.entries(INDEX_TO_TEMPLATE)) {
      expect(known.has(slug), `index ${index} -> unknown template "${slug}"`).toBe(true);
    }
  });

  it("returns null for the captions-off sentinel rather than a wrong style", () => {
    // -1 is not a style. A caller that forgets to check should get a loud null,
    // not silently-applied Classic.
    expect(templateIdForIndex(-1)).toBeNull();
    expect(templateIdForIndex(null)).toBeNull();
    expect(templateIdForIndex(undefined)).toBeNull();
  });

  it("falls back for an out-of-range index instead of returning undefined", () => {
    // Neither create route validated this field, so 9999 exists in the wild.
    expect(templateIdForIndex(9999)).toBe(DEFAULT_TEMPLATE_ID);
    expect(templateIdForIndex(16)).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("maps the families the way the look implies", () => {
    expect(templateIdForIndex(10)).toBe("hormozi"); // Impact
    expect(templateIdForIndex(2)).toBe("news");     // Serif
    expect(templateIdForIndex(6)).toBe("neon");     // Green
    expect(templateIdForIndex(0)).toBe("clean");    // Classic
  });
});

describe("indexForTemplateId", () => {
  it("maps every shipped template, premium included", () => {
    // The v1 API still returns this integer, so a template with no entry would
    // report style 0 for a clip that is visibly nothing like Classic.
    for (const t of CAPTION_TEMPLATES) {
      expect(TEMPLATE_TO_INDEX[t.id], `template "${t.id}" has no legacy index`).toBeDefined();
    }
  });

  it("only produces indices the legacy tables can resolve", () => {
    for (const [slug, index] of Object.entries(TEMPLATE_TO_INDEX)) {
      expect(index, `${slug} -> ${index}`).toBeGreaterThanOrEqual(0);
      expect(index, `${slug} -> ${index}`).toBeLessThanOrEqual(15);
    }
  });

  it("round-trips a native template through its canonical index", () => {
    for (const slug of ["clean", "podcast", "news", "neon", "hormozi"]) {
      expect(templateIdForIndex(indexForTemplateId(slug))).toBe(slug);
    }
  });

  it("falls back to 0 for an unknown slug", () => {
    expect(indexForTemplateId("does-not-exist")).toBe(0);
    expect(indexForTemplateId(null)).toBe(0);
    expect(indexForTemplateId("")).toBe(0);
  });
});
