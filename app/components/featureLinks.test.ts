import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS, APP_TOOL_GROUPS, HOME_TOOLS, HUB_TOOLS } from "./featureLinks";
import { TOOL_COSTS } from "@/lib/tool-costs";

// The registry is string-keyed, so a typo'd href or cost key compiles fine and
// only shows up as a 404 or a missing badge. These pin it to the filesystem.

describe("tool registry", () => {
  it("points every in-app href at a real dashboard page", () => {
    const missing = ALL_TOOLS.filter(
      (tool) => !existsSync(path.join(process.cwd(), "app", tool.href, "page.tsx")),
    ).map((tool) => tool.href);
    expect(missing).toEqual([]);
  });

  it("prices every hub tool from TOOL_COSTS (bar the per-model image generator)", () => {
    const unpriced = HUB_TOOLS.filter(
      (tool) => tool.slug !== "ai-image-generator" && !TOOL_COSTS[tool.costKey ?? tool.slug],
    ).map((tool) => tool.slug);
    expect(unpriced).toEqual([]);
  });

  it("keeps AutoClip and the Editor off the AI Tools hub", () => {
    const slugs = HUB_TOOLS.map((tool) => tool.slug);
    expect(slugs).not.toContain("auto-clip");
    expect(slugs).not.toContain("video-editor");
  });

  it("puts every other tool in a known hub section", () => {
    const groups = new Set(APP_TOOL_GROUPS);
    const orphans = ALL_TOOLS.filter(
      (tool) => tool.slug !== "auto-clip" && tool.slug !== "video-editor" && !(tool.appGroup && groups.has(tool.appGroup)),
    ).map((tool) => tool.slug);
    expect(orphans).toEqual([]);
  });

  it("only features hub tools on Home, with unique ranks", () => {
    expect(HOME_TOOLS.every((tool) => tool.appGroup)).toBe(true);
    const ranks = HOME_TOOLS.map((tool) => tool.homeRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});
