import { describe, expect, it } from "vitest";
import { CAPTION_FAMILIES } from "@clipiro/shared/caption-templates";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";
import { BLOG_POSTS } from "@/app/blog/posts";
import { GAMING_CAPTION_FAMILY_IDS, GTA6_CONTENT, NOT_AFFILIATED } from "./content";

const pageText = JSON.stringify(GTA6_CONTENT);
const post = BLOG_POSTS.find((p) => p.slug === "how-to-clip-gta-6-streams");
const postText = JSON.stringify(post);

describe("GTA 6 landing page copy", () => {
  it("quotes the plan limits the code enforces", () => {
    expect(pageText).toContain(`${TIER_MAX_AUTOCLIP_SOURCE_SECONDS.studio / 3600} hours`);
    expect(pageText).toContain(`${TIER_MAX_AUTOCLIP_SOURCE_SECONDS.free / 60} minutes`);
    expect(pageText).toContain(`${FREE_TIER_MONTHLY_BONUS_MINUTES} free minutes`);
  });

  it("links only caption families that exist", () => {
    const ids = new Set(CAPTION_FAMILIES.map((f) => f.id));
    for (const id of GAMING_CAPTION_FAMILY_IDS) expect(ids.has(id), id).toBe(true);
  });

  it("says plainly it is not affiliated with Rockstar or Take-Two", () => {
    expect(NOT_AFFILIATED).toMatch(/not affiliated with.*Rockstar Games.*Take-Two Interactive/);
    expect(GTA6_CONTENT.faqs.some((f) => f.answer === NOT_AFFILIATED)).toBe(true);
  });

  // Rockstar's policy covers non-commercial fan use and bars using its material
  // to promote a product: never imply endorsement, never promise monetization.
  it.each([
    ["page", pageText],
    ["blog post", postText],
  ])("the %s never implies endorsement or promises monetization", (_name, text) => {
    expect(text).not.toMatch(/\bofficial\b/i);
    expect(text).not.toMatch(/\b(endorsed|partnered) by Rockstar/i);
    expect(text).not.toMatch(/you can (monetize|make money|earn)/i);
  });

  it("is honest that silent gameplay does not work", () => {
    expect(GTA6_CONTENT.bestFor.doesNotWork.join(" ")).toMatch(/no commentary/i);
    expect(GTA6_CONTENT.faqs.some((f) => /without commentary/i.test(f.question))).toBe(true);
  });

  it("has a blog post that links back to the page", () => {
    expect(post).toBeDefined();
    expect(post!.body.some((b) => b.type === "cta" && b.href === "/gta-6-clip-maker")).toBe(true);
  });
});
