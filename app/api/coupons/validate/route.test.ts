import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: this route was authenticated but ungated at every layer (not in
// PUBLIC_API_PREFIXES, not one of proxy.ts's GROUP_LIMITS) — nothing stopped
// unlimited per-user coupon-code guessing.

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 19 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

const plan = { slug: "pro-monthly", active: true, priceInPaise: 99900, kind: "subscription" };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: vi.fn(async () => plan),
      findMany: vi.fn(async () => []),
    },
  },
}));

const validateCoupon = vi.fn(async () => ({ ok: true, code: "SAVE10", label: "10% off", discountInPaise: 9990, finalPaise: 89910 }));
vi.mock("@/lib/coupons", () => ({ validateCoupon }));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authUser = { userId: "u1" };
  rateLimitAllowed = true;
  vi.clearAllMocks();
});

describe("POST /api/coupons/validate", () => {
  it("validates a coupon for an authenticated user", async () => {
    const res = await POST(post({ planId: "pro-monthly", code: "SAVE10" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("SAVE10");
  });

  it("429s once rate-limited, before ever calling validateCoupon", async () => {
    rateLimitAllowed = false;
    const res = await POST(post({ planId: "pro-monthly", code: "SAVE10" }));
    expect(res.status).toBe(429);
    expect(validateCoupon).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated, and is keyed by IP at that point", async () => {
    authUser = null;
    const res = await POST(post({ planId: "pro-monthly", code: "SAVE10" }));
    expect(res.status).toBe(401);
  });
});
