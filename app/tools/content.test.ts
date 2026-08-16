import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/components/featureLinks";
import { TOOL_CONTENT } from "./content";

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
