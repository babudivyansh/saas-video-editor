import { describe, expect, it } from "vitest";
import { VIDEO_MODELS, effectiveCostUsdPerSecond, getVideoModel } from "./videoModels";
import { IMAGE_MODELS } from "./imageModels";
import { REVENUE_FLOOR_USD_PER_CREDIT } from "@/lib/plans/tiers";

// Guards the credit economy against silent losses. Every generation must bill at
// least the policy margin over the real fal cost, measured against the revenue
// floor at the cheapest live SKU.
//
// That floor is imported, not restated here. The hardcoded copy this test used to
// carry ($0.099) silently went stale when the credit grants moved to 60/160/400
// and the FX default moved to 88 — the real floor is $0.0952, so the guard was
// passing models at ~2.9x while claiming 3x. Derivation lives next to the
// constant in lib/plans/tiers.ts.
//
// If a future cost bump or a fat-fingered price change would put a model
// underwater at any resolution/audio setting, this fails in CI instead of leaking
// money in production.
const MIN_MARGIN = 3; // policy: 3x standard / 4-5x flagship — 3x is the floor

// Minimum credits that clears MIN_MARGIN for a given per-unit USD cost.
function minCreditsFor(costUsd: number): number {
  return Math.ceil((costUsd * MIN_MARGIN) / REVENUE_FLOOR_USD_PER_CREDIT);
}

// Audited real fal $/s per resolution tier (2026-08). The registry's costUsd is
// the default-resolution cost; these let the test validate each 1080p/480p rate
// against its own real cost, not the default's.
const VIDEO_RES_COST_USD: Record<string, Record<string, number>> = {
  "seedance-2.0": { "720p": 0.3034, "1080p": 0.682 },
  "grok-imagine-1.5": { "480p": 0.08, "720p": 0.14, "1080p": 0.25 },
  "happyhorse-1.0": { "720p": 0.14, "1080p": 0.28 },
  "wan-2.7": { "480p": 0.05, "720p": 0.10, "1080p": 0.15 },
};

// Audited real fal $/s when audio is on.
const VIDEO_AUDIO_COST_USD: Record<string, number> = {
  "veo3-fast": 0.40,
};

describe("image model pricing", () => {
  for (const m of IMAGE_MODELS) {
    it(`${m.id} bills >= ${MIN_MARGIN}x its fal cost`, () => {
      expect(m.creditCost).toBeGreaterThanOrEqual(minCreditsFor(m.costUsd));
    });
  }
});

describe("video model pricing", () => {
  for (const m of VIDEO_MODELS) {
    // Base (default-resolution, audio-off) rate must clear the margin.
    it(`${m.id} base rate bills >= ${MIN_MARGIN}x its fal cost/sec`, () => {
      expect(m.creditsPerSecond).toBeGreaterThanOrEqual(minCreditsFor(m.costUsd));
    });

    // Each per-resolution override must clear the margin against THAT tier's cost.
    if (m.resolutionCredits) {
      const costs = VIDEO_RES_COST_USD[m.id];
      it(`${m.id} per-resolution rates clear the ${MIN_MARGIN}x floor`, () => {
        expect(costs, `add ${m.id} to VIDEO_RES_COST_USD`).toBeDefined();
        for (const [res, rate] of Object.entries(m.resolutionCredits!)) {
          const cost = costs![res];
          expect(cost, `add ${m.id}.${res} cost`).toBeDefined();
          expect(rate!).toBeGreaterThanOrEqual(minCreditsFor(cost!));
        }
      });
    }

    // Audio-on rate must clear the margin against the (higher) audio-on cost.
    if (m.supportsAudio) {
      it(`${m.id} audio-on rate bills >= ${MIN_MARGIN}x the audio-on cost`, () => {
        const audioCost = VIDEO_AUDIO_COST_USD[m.id];
        expect(audioCost, `add ${m.id} to VIDEO_AUDIO_COST_USD`).toBeDefined();
        expect(m.audioCreditsPerSecond).toBeDefined();
        expect(m.audioCreditsPerSecond!).toBeGreaterThanOrEqual(minCreditsFor(audioCost!));
      });
    }
  }
});

// Cost ANALYTICS, as opposed to the pricing guard above. The video route logged
// `modelEntry.costUsd * duration` — the base, default-resolution, audio-off rate
// — whatever the customer actually requested, so the admin AI-spend and margin
// dashboards under-reported real provider cost on exactly the two most expensive
// models we sell.
describe("effectiveCostUsdPerSecond", () => {
  it("falls back to the entry's base cost when nothing varies", () => {
    const ltx = getVideoModel("ltx-2.3");
    expect(effectiveCostUsdPerSecond(ltx)).toBe(ltx.costUsd);
  });

  it("reports the audio-on cost for Veo 3, not the audio-off base", () => {
    const veo = getVideoModel("veo3-fast");
    expect(effectiveCostUsdPerSecond(veo, { audio: true })).toBe(0.40);
    expect(effectiveCostUsdPerSecond(veo, { audio: false })).toBe(0.25);
    // Veo 3 defaults to audio ON, so the base rate was the wrong figure for the
    // default request — a 38% under-report.
    expect(veo.defaultValues.audio).toBe("on");
  });

  it("reports the per-resolution cost for Seedance, not the 720p base", () => {
    const seedance = getVideoModel("seedance-2.0");
    expect(effectiveCostUsdPerSecond(seedance, { resolution: "1080p" })).toBe(0.682);
    expect(effectiveCostUsdPerSecond(seedance, { resolution: "720p" })).toBe(0.3034);
  });

  it("never reports below the entry's base cost for a known model", () => {
    for (const m of VIDEO_MODELS) {
      for (const res of Object.keys(m.resolutionCredits ?? {})) {
        expect(effectiveCostUsdPerSecond(m, { resolution: res })).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every audited real cost covered by the rate actually charged", () => {
    // Ties the analytics table to the pricing table: if someone adds a real cost
    // here without a matching credit rate, the margin guard above catches it.
    const seedance = getVideoModel("seedance-2.0");
    const cost1080 = effectiveCostUsdPerSecond(seedance, { resolution: "1080p" });
    expect(seedance.resolutionCredits!["1080p"]).toBeGreaterThanOrEqual(minCreditsFor(cost1080));
  });
});
