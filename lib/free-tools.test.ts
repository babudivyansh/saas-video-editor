import { describe, expect, it } from "vitest";
import { FREE_TOOL_DAILY_CAPS, isFreeTool } from "./free-tools";
import { TOOL_COSTS } from "./tool-costs";

describe("free tools", () => {
  it("includes the downloaders, so their pages and UI say Free", () => {
    expect(isFreeTool("youtube-downloader")).toBe(true);
    expect(isFreeTool("instagram-downloader")).toBe(true);
    expect(isFreeTool("ai-image-generator")).toBe(false);
    expect(isFreeTool("toString")).toBe(false); // own keys only
  });

  it("every free tool really costs 0 credits", () => {
    for (const slug of Object.keys(FREE_TOOL_DAILY_CAPS)) {
      expect(TOOL_COSTS[slug]?.creditCost ?? 0, slug).toBe(0);
    }
  });
});
