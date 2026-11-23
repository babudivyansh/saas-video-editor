import { describe, expect, it } from "vitest";
import { isSampleKey, samplesFor, SAMPLE_VIDEOS, sampleVideoKey } from "@/lib/sample-projects";
import { TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";
import { FREE_TIER_SIGNUP_MINUTES } from "@/lib/plans/tiers";
import { CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";

describe("sample videos", () => {
  it("puts the sample matching what the user makes first", () => {
    expect(samplesFor("gaming").map((s) => s.id)).toEqual(["gaming", "podcast", "vlog"]);
    expect(samplesFor(null).map((s) => s.id)).toEqual(["podcast", "gaming", "vlog"]);
  });

  it("only treats the shared prefix as a sample key", () => {
    expect(isSampleKey(sampleVideoKey("podcast"))).toBe(true);
    expect(isSampleKey("uploads/u1/samples/x.mp4")).toBe(false);
  });

  it("each demo's caption template is a real one", () => {
    const ids = new Set(CAPTION_TEMPLATES.map((t) => t.id));
    for (const s of SAMPLE_VIDEOS) expect(ids.has(s.demoCaptionTemplateId)).toBe(true);
  });

  it("each fits a Starter account: under the source cap, and within the signup minutes", () => {
    for (const s of SAMPLE_VIDEOS) {
      expect(s.duration).toBeLessThanOrEqual(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.free);
      expect(Math.ceil(s.duration / 60)).toBeLessThanOrEqual(FREE_TIER_SIGNUP_MINUTES);
    }
  });
});
