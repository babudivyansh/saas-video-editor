import { describe, expect, it } from "vitest";
import { voiceoverCredits, vocalRemoverCredits, voiceFxCredits } from "./audio-pricing";

// The net revenue floor after GST and the Razorpay fee (lib/plans/tiers.ts on
// the Stage 1 branch). Restated here so this file stands alone.
const NET_FLOOR_USD_PER_CREDIT = 0.0784;
const MIN_MARGIN = 3;
const clears = (credits: number, costUsd: number) => credits * NET_FLOOR_USD_PER_CREDIT >= costUsd * MIN_MARGIN;

describe("voiceover — 1 credit per 500 characters", () => {
  it("rounds up and never charges zero", () => {
    expect(voiceoverCredits(0)).toBe(1);
    expect(voiceoverCredits(1)).toBe(1);
    expect(voiceoverCredits(500)).toBe(1);
    expect(voiceoverCredits(501)).toBe(2);
    expect(voiceoverCredits(2000)).toBe(4);
  });
  it("clears 3x the $0.05/1,000-char cost at every length up to the cap", () => {
    for (let chars = 1; chars <= 2000; chars += 37) {
      expect(clears(voiceoverCredits(chars), (chars / 1000) * 0.05), `${chars} chars`).toBe(true);
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
