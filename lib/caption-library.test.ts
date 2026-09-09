// @vitest-environment node
//
// Guards for the full provider library (45 templates) now that the picker
// offers all of it rather than a curated 12.
import { describe, it, expect } from "vitest";
import {
  CAPTION_TEMPLATES,
  CAPTION_CATEGORIES,
  isProviderTemplate,
  providerNameToSlug,
  PLACEHOLDER_LOOK_BY_ID,
} from "./caption-templates";

/**
 * The provider's live template list, read from GET /v1/templates on 2026-09-08.
 * Hard-coded on purpose: it is a snapshot of an external fact, and the point of
 * the test is to catch our copy drifting from it.
 */
const LIVE_TEMPLATE_NAMES = [
  "Matt", "Jess", "Jack", "Nick", "Laura", "Kelly 2", "Claire", "Michael", "Caleb",
  "Kendrick", "Lewis", "Doug", "Carlos", "Luke", "Leila", "Mark", "Sara", "Daniel",
  "Dan 2", "Hormozi 4", "Dan", "Devin", "Tayo", "Ella", "Tracy", "Hormozi 1",
  "Hormozi 2", "Hormozi 3", "Hormozi 5", "Jason", "William", "Leon", "Ali", "Beast",
  "Bob", "Maya", "Karl", "Iman", "Umi", "David", "Noah", "Gstaad", "Malta", "Nema",
  "seth",
];

/**
 * Fonts the render host can actually resolve: the six bundled in public/fonts
 * plus the three the legacy style table has always used.
 */
const AVAILABLE_FONTS = new Set([
  "Anton", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Poppins",
  "Impact", "Arial", "Times New Roman", "Outfit",
]);

const providerTemplates = CAPTION_TEMPLATES.filter(isProviderTemplate);

describe("the provider library", () => {
  it("offers every template the provider actually has, exactly once", () => {
    const mapped = providerTemplates.map((t) => t.providerTemplateId!);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual([...LIVE_TEMPLATE_NAMES].sort());
  });

  it("sends the provider's spelling on the wire even where the label differs", () => {
    // "seth" is lower-case in their list. The label is title-cased so the grid
    // doesn't look broken; the NAME must stay byte-identical or create fails
    // provider-side validation.
    const seth = CAPTION_TEMPLATES.find((t) => t.providerTemplateId === "seth");
    expect(seth?.label).toBe("Seth");
    expect(seth?.providerTemplateId).toBe("seth");
  });

  it("keeps every id unique — ids are stored on clips, so a collision is corruption", () => {
    const ids = CAPTION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives slugs that stay url- and storage-safe", () => {
    expect(providerNameToSlug("Kelly 2")).toBe("kelly-2");
    expect(providerNameToSlug("Hormozi 4")).toBe("hormozi-4");
    expect(providerNameToSlug("seth")).toBe("seth");
    for (const t of CAPTION_TEMPLATES) expect(t.id).toMatch(/^[a-z0-9-]+$/);
  });

  it("uses only fonts the renderer can resolve", () => {
    // A font the host lacks silently falls back to libass's default, which
    // makes a placeholder wrong in a way nobody sees until a clip renders.
    for (const t of CAPTION_TEMPLATES) {
      if (t.style.fontName) {
        expect(AVAILABLE_FONTS.has(t.style.fontName), `${t.label}: ${t.style.fontName}`).toBe(true);
      }
    }
  });

  it("marks every unauthored look as unverified, and none of the authored ones", () => {
    for (const t of CAPTION_TEMPLATES) {
      const isPlaceholder = t.id in PLACEHOLDER_LOOK_BY_ID;
      expect(t.lookVerified === false, `${t.label}`).toBe(isPlaceholder);
    }
    // The 12 hand-written premium templates plus 6 native ones stay authored.
    expect(CAPTION_TEMPLATES.filter((t) => t.lookVerified === false)).toHaveLength(33);
  });

  it("files the unauthored ones under a real category so the picker can hide them", () => {
    for (const t of CAPTION_TEMPLATES) {
      if (t.category) expect(CAPTION_CATEGORIES).toContain(t.category);
    }
    const more = CAPTION_TEMPLATES.filter((t) => t.category === "More");
    // 33 placeholders minus Hormozi 4, which sits with its own family.
    expect(more).toHaveLength(32);
    expect(CAPTION_TEMPLATES.find((t) => t.id === "hormozi-4")?.category).toBe("Viral");
  });

  it("claims emoji only where we have grounds to", () => {
    // Nothing in the API says which provider templates carry emoji, so an
    // unverified template must not claim them — except Hormozi 4, whose four
    // siblings are all mapped and all do.
    for (const id of Object.keys(PLACEHOLDER_LOOK_BY_ID)) {
      const t = CAPTION_TEMPLATES.find((x) => x.id === id)!;
      expect(t.emoji, `${t.label}`).toBe(id === "hormozi-4");
    }
  });

  it("gives every template the fields the picker and the renderer need", () => {
    for (const t of CAPTION_TEMPLATES) {
      expect(t.label, t.id).toBeTruthy();
      expect(t.hint, t.id).toBeTruthy();
      expect(t.style.fontName, t.id).toBeTruthy();
      expect(t.style.baseColor, t.id).toMatch(/^&H[0-9A-F]{8}$/i);
    }
  });
});
