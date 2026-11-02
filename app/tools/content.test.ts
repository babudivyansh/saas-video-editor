import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/components/featureLinks";
import { TOOL_CONTENT } from "./content";
import { TOOL_IMAGES } from "./toolImages";

describe("tool marketing content", () => {
  it("has an entry for every tool", () => {
    const missing = ALL_TOOLS.filter((tool) => !TOOL_CONTENT[tool.slug]).map((tool) => tool.slug);
    expect(missing).toEqual([]);
  });

  it("has no orphaned entries", () => {
    const slugs = new Set(ALL_TOOLS.map((tool) => tool.slug));
    const orphans = Object.keys(TOOL_CONTENT).filter((slug) => !slugs.has(slug));
    expect(orphans).toEqual([]);
  });

  it("uses unique slugs across all three categories", () => {
    const slugs = ALL_TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every tool three steps and at least three benefits and FAQs", () => {
    for (const tool of ALL_TOOLS) {
      const content = TOOL_CONTENT[tool.slug];
      expect(content.steps, `${tool.slug} steps`).toHaveLength(3);
      expect(content.benefits.length, `${tool.slug} benefits`).toBeGreaterThanOrEqual(3);
      expect(content.faqs.length, `${tool.slug} faqs`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps meta descriptions within the length Google renders", () => {
    for (const tool of ALL_TOOLS) {
      const { metaDescription, metaTitle } = TOOL_CONTENT[tool.slug];
      expect(metaDescription.length, `${tool.slug} description`).toBeLessThanOrEqual(165);
      expect(metaTitle.length, `${tool.slug} title`).toBeLessThanOrEqual(60);
    }
  });

  // Plan minute grants live in prisma/seed.ts (DB rows, not importable without
  // a database client), so read them as text: the AutoClip pricing FAQ quoted
  // Creator's old 150 minutes for a month after the 2026-10-30 restructure.
  it("quotes each plan's monthly Clip Minutes as seeded", () => {
    const seed = readFileSync(path.join(process.cwd(), "prisma/seed.ts"), "utf8");
    const answer = TOOL_CONTENT["auto-clip"].faqs.find((f) => f.question === "How is AutoClip priced?")!.answer;
    const rows = [...seed.matchAll(/name: "(\w+) \(Monthly\)".*?monthlyMinutes: (\d+)/g)];
    expect(rows.length).toBeGreaterThan(0);
    for (const [, plan, minutes] of rows) {
      expect(answer, plan).toMatch(new RegExp(`${plan}( includes)? ${Number(minutes).toLocaleString("en-US")}\\b`));
    }
  });
});

describe("tool artwork", () => {
  it("only declares artwork for real tools", () => {
    const known = new Set(ALL_TOOLS.map((t) => t.slug));
    expect(Object.keys(TOOL_IMAGES).filter((slug) => !known.has(slug))).toEqual([]);
  });

  it("has every declared file on disk", () => {
    // public/tools once held 44 committed assets that no code referenced. This
    // catches the inverse — a registry entry pointing at a file that is gone.
    const missing: string[] = [];
    for (const set of Object.values(TOOL_IMAGES)) {
      for (const image of [set.primary, set.secondary]) {
        if (!image) continue;
        if (!existsSync(path.join(process.cwd(), "public", image.src))) missing.push(image.src);
      }
    }
    expect(missing).toEqual([]);
  });

  it("describes each piece of artwork distinctly", () => {
    for (const [slug, set] of Object.entries(TOOL_IMAGES)) {
      expect(set.primary.alt.length, `${slug} primary alt`).toBeGreaterThan(30);
      expect(set.primary.width, `${slug} primary width`).toBeGreaterThan(0);
      expect(set.primary.blurDataURL, `${slug} primary blur`).toMatch(/^data:image\/webp;base64,/);
      if (set.secondary) {
        expect(set.secondary.alt, `${slug} secondary alt`).not.toBe(set.primary.alt);
        expect(set.secondary.blurDataURL, `${slug} secondary blur`).toMatch(/^data:image\/webp;base64,/);
      }
    }
  });
});
