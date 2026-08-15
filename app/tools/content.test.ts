import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/components/featureLinks";
import { TOOL_CONTENT, getToolShots } from "./content";
import { TOOL_SHOT_FILES } from "./shots";

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
});

describe("tool screenshots", () => {
  const slugsWithShots = Object.keys(TOOL_SHOT_FILES);

  it("only declares shots for real tools", () => {
    const known = new Set(ALL_TOOLS.map((t) => t.slug));
    expect(slugsWithShots.filter((slug) => !known.has(slug))).toEqual([]);
  });

  it("has every declared file on disk", () => {
    const missing: string[] = [];
    for (const files of Object.values(TOOL_SHOT_FILES)) {
      for (const file of [files.ready, files.result]) {
        if (!file) continue;
        if (!existsSync(path.join(process.cwd(), "public", file.src))) missing.push(file.src);
      }
    }
    expect(missing).toEqual([]);
  });

  it("carries usable intrinsic dimensions and a blur placeholder", () => {
    for (const [slug, files] of Object.entries(TOOL_SHOT_FILES)) {
      for (const [name, file] of Object.entries(files)) {
        if (!file) continue;
        expect(file.width, `${slug}.${name} width`).toBeGreaterThan(0);
        expect(file.height, `${slug}.${name} height`).toBeGreaterThan(0);
        expect(file.blurDataURL, `${slug}.${name} blur`).toMatch(/^data:image\/webp;base64,/);
      }
    }
  });

  it("resolves only shots that have hand-written alt text", () => {
    for (const slug of slugsWithShots) {
      const shots = getToolShots(slug);
      // A file with no alt text is dropped rather than rendered — assert the
      // pairing held, so a re-capture that adds a file without copy is caught.
      expect(shots.ready, `${slug} ready`).toBeTruthy();
      expect(shots.ready!.alt.length, `${slug} ready alt`).toBeGreaterThan(20);
      if (TOOL_SHOT_FILES[slug].result) {
        expect(shots.result, `${slug} result`).toBeTruthy();
        expect(shots.result!.alt).not.toBe(shots.ready!.alt);
      }
    }
  });
});
