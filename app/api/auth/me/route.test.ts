import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// subscriptionCurrency drives every "next / first charge" line in billing. It
// must be the currency the subscription bills in — stored, or for older
// subscribers their latest plan purchase — never the viewer's locale.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/currency", () => ({ getPlanPriceMinor: vi.fn(async () => 2900) }));

let userRow: Record<string, unknown>;
let lastPurchaseCurrency: string | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => userRow) },
    purchase: { findFirst: vi.fn(async () => (lastPurchaseCurrency ? { currency: lastPurchaseCurrency } : null)) },
  },
}));

const { GET } = await import("./route");
const me = async () => (await (await GET(new NextRequest("http://localhost/api/auth/me"))).json()).user;

beforeEach(() => {
  lastPurchaseCurrency = null;
  userRow = {
    id: "u1", email: "a@test.com", credits: 0, bonusCredits: 0, subscriptionCredits: 0, purchasedCredits: 0,
    subscriptionEndsAt: new Date(Date.now() + 10 * 86_400_000), subscriptionCurrency: null,
    plan: { id: "p", slug: "sub_pro_1mo", name: "Pro", credits: 160, priceInPaise: 219900, tier: "pro" },
    _count: { purchases: 1 },
  };
});

describe("GET /api/auth/me — subscriptionCurrency", () => {
  it("returns the stored subscription currency", async () => {
    userRow.subscriptionCurrency = "INR";
    lastPurchaseCurrency = "USD"; // ignored when a value is stored
    expect((await me()).subscriptionCurrency).toBe("INR");
  });

  it("falls back to the latest plan purchase's currency for older subscribers", async () => {
    lastPurchaseCurrency = "USD";
    expect((await me()).subscriptionCurrency).toBe("USD");
  });

  it("is null when nothing is known, so the client uses the viewer's currency", async () => {
    expect((await me()).subscriptionCurrency).toBeNull();
  });

  it("does not leak the internal _count", async () => {
    const u = await me();
    expect(u._count).toBeUndefined();
    expect(u.hasPurchased).toBe(true);
  });
});
