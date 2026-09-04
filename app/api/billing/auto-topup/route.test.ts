import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: auto-topup used to fire at one hardcoded global threshold
// (lib/credits.ts AUTO_TOPUP_THRESHOLD). This route now lets each user set
// their own trigger balance, bounded to [5, 100] server-side — the UI's
// number input has the same bounds, but the server must not trust it.

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));

const ACTIVE_PACK = { slug: "pack-50", active: true, kind: "pack" };
const findUniquePlan = vi.fn(async () => ACTIVE_PACK);
const findUniqueUser = vi.fn(async () => ({ autoTopupPackSlug: "pack-50", autoTopupThreshold: 25 }));
const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  autoTopupPackSlug: "packSlug" in data ? data.packSlug : "pack-50",
  autoTopupThreshold: "autoTopupThreshold" in data ? data.autoTopupThreshold : 25,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findUnique: (...a: unknown[]) => (findUniquePlan as unknown as (...x: unknown[]) => unknown)(...a) },
    user: {
      findUnique: (...a: unknown[]) => (findUniqueUser as unknown as (...x: unknown[]) => unknown)(...a),
      update: (...a: unknown[]) => (update as unknown as (...x: unknown[]) => unknown)(...a),
    },
  },
}));

const { GET, PATCH } = await import("./route");

function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/billing/auto-topup", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniquePlan.mockResolvedValue(ACTIVE_PACK);
  findUniqueUser.mockResolvedValue({ autoTopupPackSlug: "pack-50", autoTopupThreshold: 25 });
});

describe("GET /api/billing/auto-topup", () => {
  it("returns the saved threshold, defaulting to 10 when unset", async () => {
    findUniqueUser.mockResolvedValueOnce({ autoTopupPackSlug: null, autoTopupThreshold: 10 });
    const res = await GET(new NextRequest("http://localhost/api/billing/auto-topup"));
    const json = await res.json();
    expect(json).toEqual({ autoTopupPackSlug: null, autoTopupThreshold: 10 });
  });
});

describe("PATCH /api/billing/auto-topup — threshold bounds", () => {
  it("accepts a threshold within [5, 100] alongside packSlug", async () => {
    const res = await PATCH(patch({ packSlug: "pack-50", threshold: 30 }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ autoTopupPackSlug: "pack-50", autoTopupThreshold: 30 }),
    }));
  });

  it("rejects a threshold below the minimum", async () => {
    const res = await PATCH(patch({ packSlug: "pack-50", threshold: 4 }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a threshold above the maximum", async () => {
    const res = await PATCH(patch({ packSlug: "pack-50", threshold: 101 }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a non-integer threshold", async () => {
    const res = await PATCH(patch({ packSlug: "pack-50", threshold: 12.5 }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a threshold-only update without packSlug present", async () => {
    const res = await PATCH(patch({ threshold: 40 }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { autoTopupThreshold: 40 },
    }));
  });

  it("still validates packSlug against the active-pack list", async () => {
    findUniquePlan.mockResolvedValueOnce(null);
    const res = await PATCH(patch({ packSlug: "not-a-real-pack" }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
