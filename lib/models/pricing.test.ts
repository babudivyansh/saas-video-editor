import { describe, expect, it } from "vitest";
import { VIDEO_MODELS } from "./videoModels";
import { IMAGE_MODELS } from "./imageModels";

// Guards the credit economy against silent losses. Every generation must bill at
// least the policy margin over the real fal cost, computed at the cheapest plan's
// $0.099/credit revenue floor (see the header comments in videoModels.ts /
// imageModels.ts). If a future cost bump or a fat-fingered price change would put
// a model underwater at any resolution/audio setting, this test fails in CI
// instead of leaking money in production.

const REVENUE_FLOOR_USD_PER_CREDIT = 0.099;
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
