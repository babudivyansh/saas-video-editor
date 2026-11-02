import { describe, expect, it } from "vitest";
import { voiceoverCredits, vocalRemoverCredits, voiceFxCredits } from "./audio-pricing";

// The net revenue floor after GST and the Razorpay fee (lib/plans/tiers.ts on
// the Stage 1 branch). Restated here so this file stands alone.
const NET_FLOOR_USD_PER_CREDIT = 0.0784;
const MIN_MARGIN = 3;
const clears = (credits: number, costUsd: number) => credits * NET_FLOOR_USD_PER_CREDIT >= costUsd * MIN_MARGIN;

describe("voiceover — 1 credit per 300 characters, 150 in Studio quality", () => {
  // One ElevenLabs credit on the Pro plan: $99 / 500,000. The standard models
  // (v4_turbo, flash) bill 0.5 of those per character, eleven_v4 bills 1.0.
  const EL_CREDIT_USD = 99 / 500_000;
  const standardCost = (chars: number) => chars * 0.5 * EL_CREDIT_USD;
  const studioCost = (chars: number) => chars * 1.0 * EL_CREDIT_USD;
  // 2.5x, not the 3x the other tools clear: the deliberate 2026-11-01 price
  // (voiceover audit). Scale-plan credits ($0.165/1,000) bring it to ~3x.
  const clearsVoice = (credits: number, costUsd: number) => credits * NET_FLOOR_USD_PER_CREDIT >= costUsd * 2.5;

  it("rounds up and never charges zero", () => {
    expect(voiceoverCredits(0)).toBe(1);
    expect(voiceoverCredits(1)).toBe(1);
    expect(voiceoverCredits(300)).toBe(1);
    expect(voiceoverCredits(301)).toBe(2);
    expect(voiceoverCredits(10_000)).toBe(34);
  });
  it("charges Studio quality twice the standard rate", () => {
    expect(voiceoverCredits(150, "studio")).toBe(1);
    expect(voiceoverCredits(151, "studio")).toBe(2);
    expect(voiceoverCredits(3000, "studio")).toBe(2 * voiceoverCredits(3000));
  });
  it("scales by the voice's provider rate and never discounts", () => {
    expect(voiceoverCredits(300, "standard", 2)).toBe(2);
    expect(voiceoverCredits(301, "standard", 1.5)).toBe(3);
    expect(voiceoverCredits(300, "standard", 0.5)).toBe(1);
    expect(voiceoverCredits(300, "standard", Number.NaN)).toBe(1);
  });
  it("clears 2.5x the Pro-plan cost at every length up to the 10,000-char cap", () => {
    for (let chars = 1; chars <= 10_000; chars += 97) {
      expect(clearsVoice(voiceoverCredits(chars), standardCost(chars)), `${chars} chars`).toBe(true);
      expect(clearsVoice(voiceoverCredits(chars, "studio"), studioCost(chars)), `${chars} chars studio`).toBe(true);
    }
  });
});

describe("vocal remover — 1 credit per 30 seconds", () => {
  it("rounds up and never charges zero", () => {
    expect(vocalRemoverCredits(0)).toBe(1);
    expect(vocalRemoverCredits(30)).toBe(1);
    expect(vocalRemoverCredits(31)).toBe(2);
    expect(vocalRemoverCredits(300)).toBe(10);
  });
  it("clears 3x the $0.0007/s cost up to the 5-minute cap", () => {
    for (let s = 1; s <= 300; s += 7) expect(clears(vocalRemoverCredits(s), s * 0.0007), `${s}s`).toBe(true);
  });
});

describe("voice changer / speech enhancer — 8 credits per minute", () => {
  it("scales with length instead of one flat price", () => {
    expect(voiceFxCredits(0)).toBe(1);
    expect(voiceFxCredits(7)).toBe(1);
    expect(voiceFxCredits(60)).toBe(8);
    expect(voiceFxCredits(90)).toBe(12);
    expect(voiceFxCredits(90)).toBeGreaterThan(voiceFxCredits(10));
  });
  it("clears 3x the ~$0.20/min cost up to the 90s cap", () => {
    for (let s = 1; s <= 90; s += 3) expect(clears(voiceFxCredits(s), (s / 60) * 0.2), `${s}s`).toBe(true);
  });
});
