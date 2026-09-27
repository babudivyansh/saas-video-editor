import { describe, expect, it } from "vitest";
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

describe("image model pricing", () => {
  for (const m of IMAGE_MODELS) {
    it(`${m.id} bills >= ${MIN_MARGIN}x its fal cost`, () => {
      expect(m.creditCost).toBeGreaterThanOrEqual(minCreditsFor(m.costUsd));
    });
  }
});
