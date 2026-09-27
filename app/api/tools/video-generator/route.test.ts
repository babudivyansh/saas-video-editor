import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// What the route charges and what it actually sends to fal. Before the
// 2026-09-27 audit the route passed a bare number for Veo 3's "8s" enum and for
// Wan/PixVerse/Seedance's string enums, clamped lengths to a range the provider
// didn't accept (LTX 5s, Wan 8s), and forwarded reference images to text-only
// endpoints — so runs failed and refunded, or ignored what the user paid for.

let tier = "pro";
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));
vi.mock("@/lib/env", () => ({ env: { FAL_KEY: "test-key" } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));

let overrides: Record<string, { enabled?: boolean; creditCost?: number }> = {};
vi.mock("@/lib/model-overrides", () => ({ getModelOverrides: vi.fn(async () => overrides) }));

const chargeCredits = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, balance: 1000, generationId: "g1" }));
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...a),
  refundCredits: vi.fn(async () => undefined),
  markGenerationStatus: vi.fn(async () => undefined),
  updateGenerationProgress: vi.fn(async () => undefined),
  checkModelAccess: vi.fn(async () => ({ allowed: true })),
}));

const falSubmit = vi.fn(async (..._a: unknown[]) => "req-1");
vi.mock("@/lib/fal", () => ({
  falSubmit: (...a: unknown[]) => falSubmit(...a),
  // Never resolves: these tests only inspect the synchronous charge + submit.
  falPollUntilDone: vi.fn(() => new Promise(() => {})),
  extractResultUrl: vi.fn(),
}));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/tools/video-generator", {
    method: "POST",
    body: JSON.stringify({ prompt: "a cat surfing", ...body }),
    headers: { "Content-Type": "application/json" },
  }));
}

const charged = () => (chargeCredits.mock.calls.at(-1)![0] as { amount: number }).amount;
const falInput = () => falSubmit.mock.calls.at(-1)![1] as Record<string, unknown>;

describe("POST /api/tools/video-generator — provider-valid inputs", () => {
  beforeEach(() => {
    tier = "pro";
    overrides = {};
    chargeCredits.mockClear();
    falSubmit.mockClear();
  });

  it("Veo 3 sends the \"8s\" string enum, bills its audio-on default, drops the image and a ratio it can't do", async () => {
    const res = await post({ model: "veo3-fast", aspectRatio: "1:1", referenceImageUrl: "https://x/img.png" });
    expect(res.status).toBe(202);
    expect(charged()).toBe(16 * 8);
    expect(falInput()).toMatchObject({ duration: "8s", aspect_ratio: "16:9", generate_audio: true });
    expect(falInput()).not.toHaveProperty("image_url");
  });

  it("snaps Wan to a length fal accepts and sends it as a string", async () => {
    await post({ model: "wan-2.7", duration: 8, resolution: "480p" });
    expect(charged()).toBe(2 * 5);
    expect(falInput()).toMatchObject({ duration: "5", resolution: "480p" });
  });

  it("bills a too-short LTX request at its 6s floor and 1080p, not the rejected 5s / 720p", async () => {
    tier = "creator";
    await post({ model: "ltx-2.3", duration: 5, resolution: "720p" });
    expect(charged()).toBe(4 * 6);
    expect(falInput()).toMatchObject({ duration: 6, resolution: "1080p" });
  });

  it("refuses Grok without a reference image instead of charging for a run fal rejects", async () => {
    const res = await post({ model: "grok-imagine-1.5" });
    expect(res.status).toBe(400);
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("scales an admin override across the audio tier instead of replacing it", async () => {
    overrides = { "veo3-fast": { creditCost: 12 } };
    await post({ model: "veo3-fast", duration: 8, audio: true });
    // base 10 -> 12 (x1.2): audio-on 16 -> ceil(19.2) = 20/s, not a flat 12.
    expect(charged()).toBe(20 * 8);
  });
});
