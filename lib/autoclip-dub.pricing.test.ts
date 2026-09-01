import { describe, expect, it } from "vitest";
import { computeDubCost } from "./autoclip-dub";
import { AUTOCLIP_PRICING_DEFAULTS } from "./autoclip-pipeline";
import { TOOL_COSTS } from "./tool-costs";

// Dubbing shipped at a flat 1 credit per dub against an ElevenLabs call billed
// per minute of audio — the same shape as the pre-audit ai-creator price that
// turned out to be loss-making.

const RATE = AUTOCLIP_PRICING_DEFAULTS.dubPerMinute;

describe("computeDubCost", () => {
  it("charges a full minute for anything up to 60s", () => {
    expect(computeDubCost(10, RATE)).toBe(RATE);
    expect(computeDubCost(60, RATE)).toBe(RATE);
  });

  it("scales with length instead of charging one flat price", () => {
    expect(computeDubCost(61, RATE)).toBe(RATE * 2);
    expect(computeDubCost(180, RATE)).toBe(RATE * 3);
    // The case the flat price got badly wrong: a 5-minute dub cost the same as a
    // 10-second one.
    expect(computeDubCost(300, RATE)).toBe(RATE * 5);
    expect(computeDubCost(300, RATE)).toBeGreaterThan(computeDubCost(10, RATE));
  });

  it("never charges nothing, even for a zero/negative duration", () => {
    // A 4-second dub still spins up a full ElevenLabs job.
    expect(computeDubCost(0, RATE)).toBeGreaterThanOrEqual(1);
    expect(computeDubCost(-5, RATE)).toBeGreaterThanOrEqual(1);
  });

  it("honours an admin rate of zero without going negative", () => {
    expect(computeDubCost(300, 0)).toBe(1);
  });
});

describe("clip-dub cost policy", () => {
  it("is gated while the provider rate is unconfirmed", () => {
    // Same mitigation as subtitle-remover and face-swap: an unknown provider cost
    // is absorbed by pro-tier credit revenue until it's confirmed.
    expect(TOOL_COSTS["clip-dub"].costUsd).toBeNull();
    expect(TOOL_COSTS["clip-dub"].requiredTier).toBe("pro");
  });

  it("publishes a price for AutoClip itself, which had none at all", () => {
    expect(TOOL_COSTS["auto-clip"]).toBeDefined();
    expect(TOOL_COSTS["auto-clip"].creditCost).toBeGreaterThan(0);
  });
});
