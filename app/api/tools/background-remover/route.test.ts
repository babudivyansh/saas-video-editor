import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level regression test for the Background Remover migration off its
// old flat, tier-agnostic 10MB constant onto the shared upload-policy
// resolver (Upload Limits Audit §9/§18) — background-remover has no
// feature-access gate and no provider term, so its effective cap is simply
// min(planMaxBytes, 10MB), i.e. always 10MB today (every tier's plan cap
// exceeds it) — this test exists to prove the route actually calls the
// shared resolver end-to-end, not just that the resolver itself is correct
// (already covered by lib/upload-policy.test.ts).

let tier: "free" | "creator" | "pro" | "studio" = "free";
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));

vi.mock("@/lib/env", () => ({ env: { FAL_KEY: "test-fal-key" } }));

const chargeCredits = vi.fn(async () => ({ ok: true, generationId: "g1" }));
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...a),
  refundCredits: vi.fn(),
  markGenerationStatus: vi.fn(),
  updateGenerationProgress: vi.fn(),
}));

vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/job-routes", () => ({
  createJobStatusHandler: () => vi.fn(),
  createJobCancelHandler: () => vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("fs", () => ({ default: { writeFileSync: vi.fn(), unlinkSync: vi.fn() } }));

const { POST } = await import("./route");

function imageRequest(bytes: number): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/tools/background-remover", { method: "POST", body: form });
}

beforeEach(() => {
  tier = "free";
  vi.clearAllMocks();
  chargeCredits.mockResolvedValue({ ok: true, generationId: "g1" });
});

describe("POST /api/tools/background-remover — effective upload policy", () => {
  it("rejects an image over the 10MB feature cap, before charging credits, on every tier", async () => {
    for (const t of ["free", "creator", "pro", "studio"] as const) {
      tier = t;
      const res = await POST(imageRequest(10 * 1024 * 1024 + 1));
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.limitingFactor).toBe("feature");
      expect(chargeCredits).not.toHaveBeenCalled();
    }
  });

  it("accepts an image at exactly the 10MB cap", async () => {
    tier = "studio";
    const res = await POST(imageRequest(10 * 1024 * 1024));
    expect(res.status).not.toBe(413);
    expect(chargeCredits).toHaveBeenCalled();
  });
});
