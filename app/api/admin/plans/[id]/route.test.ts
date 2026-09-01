import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The advertised price and the charged price must never be able to disagree.
// Razorpay Plans are immutable, so editing Plan.priceInPaise used to change what
// /pricing showed while every new subscription kept being created against the old
// Razorpay Plan — indefinitely, and invisibly.

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

const resyncMock = vi.fn(async () => [{ ok: true as const, currency: "INR" as const, razorpayPlanId: "plan_new", created: true }]);
vi.mock("@/lib/billing/razorpay-plans", () => ({
  resyncPricedCurrencies: (...a: unknown[]) => resyncMock(...(a as [])),
  storedPlanId: (plan: Record<string, string | null>, c: string) =>
    (c === "INR" ? plan.razorpayPlanIdInr : plan.razorpayPlanIdUsd) ?? null,
  SYNC_CURRENCIES: ["INR", "USD"],
}));

interface PlanRow {
  id: string; slug: string; name: string; kind: string; priceInPaise: number;
  razorpayPlanIdInr: string | null; razorpayPlanIdUsd: string | null;
  // validatePlanShape now judges the MERGED row, so the fixture has to be a
  // plan that would actually work in production.
  credits: number; monthlyCredits: number | null; intervalMonths: number | null; tier: string | null;
}
let plan: PlanRow;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === plan.id ? plan : null)),
      update: vi.fn(async ({ data }: { data: Partial<PlanRow> }) => {
        Object.assign(plan, data);
        return plan;
      }),
    },
    user: { count: vi.fn(async () => 3) },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const { PATCH, DELETE } = await import("./route");

const patch = (body: unknown) =>
  PATCH(
    new NextRequest("http://localhost/api/admin/plans/p1", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1" }) },
  );

beforeEach(() => {
  plan = {
    id: "p1", slug: "sub_pro_1mo", name: "Pro (Monthly)", kind: "subscription",
    priceInPaise: 219900, razorpayPlanIdInr: "plan_old", razorpayPlanIdUsd: null,
    credits: 160, monthlyCredits: 160, intervalMonths: 1, tier: "pro",
  };
  resyncMock.mockClear();
  resyncMock.mockResolvedValue([{ ok: true as const, currency: "INR" as const, razorpayPlanId: "plan_new", created: true }]);
});

describe("PATCH price changes", () => {
  it("re-mints the Razorpay plan at the new price before saving it", async () => {
    const res = await patch({ priceInPaise: 249900 });
    expect(res.status).toBe(200);
    // The re-sync must see the NEW price, plus the OLD one so it can skip any
    // currency whose charged amount didn't actually move.
    expect(resyncMock).toHaveBeenCalledWith(expect.objectContaining({ priceInPaise: 249900 }), 219900);
    expect(plan.priceInPaise).toBe(249900);
    expect(await res.json()).toMatchObject({ resynced: ["INR:plan_new"] });
  });

  it("refuses the edit entirely when Razorpay rejects the re-mint", async () => {
    resyncMock.mockResolvedValue([{ ok: false, currency: "INR", error: "Razorpay rejected the INR plan." }] as never);
    const res = await patch({ priceInPaise: 249900 });
    expect(res.status).toBe(502);
    // Unchanged: showing a price we cannot charge is the failure being prevented.
    expect(plan.priceInPaise).toBe(219900);
  });

  it("does not touch Razorpay when the price is unchanged", async () => {
    const res = await patch({ priceInPaise: 219900, name: "Pro Monthly" });
    expect(res.status).toBe(200);
    expect(resyncMock).not.toHaveBeenCalled();
    expect(plan.name).toBe("Pro Monthly");
  });

  it("does not touch Razorpay for a non-price edit", async () => {
    await patch({ name: "Renamed" });
    expect(resyncMock).not.toHaveBeenCalled();
  });

  it("does not touch Razorpay for a pack price change (one-time orders)", async () => {
    // A pack carries no tier/interval/monthly allowance — the shape rules reject
    // one that does, so the fixture has to become a real pack.
    plan.kind = "pack";
    plan.tier = null; plan.monthlyCredits = null; plan.intervalMonths = null; plan.credits = 30;
    const res = await patch({ priceInPaise: 69900 });
    expect(res.status).toBe(200);
    expect(resyncMock).not.toHaveBeenCalled();
    expect(plan.priceInPaise).toBe(69900);
  });

  it("404s an unknown plan", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/plans/nope", { method: "PATCH", body: JSON.stringify({ name: "x" }) }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("plan shape validation", () => {
  it("refuses a subscription whose credits disagree with monthlyCredits x interval", async () => {
    // This mismatch is what the purchase receipt and the admin plan-assign grant
    // both read, so an inconsistent row misreports what a customer received.
    const res = await patch({ credits: 999 });
    expect(res.status).toBe(400);
    expect(plan.credits).toBe(160);
  });

  it("refuses to strip the tier off a subscription", async () => {
    // A tier-less subscription renders nowhere on /pricing and grants nothing,
    // because getUserTier resolves it to "free".
    const res = await patch({ tier: null });
    expect(res.status).toBe(400);
    expect(plan.tier).toBe("pro");
  });

  it("refuses a tier on a pack", async () => {
    plan.kind = "pack";
    plan.monthlyCredits = null; plan.intervalMonths = null; plan.credits = 30;
    const res = await patch({ tier: "pro" });
    expect(res.status).toBe(400);
  });

  it("accepts a coherent change to both sides at once", async () => {
    const res = await patch({ monthlyCredits: 200, credits: 200 });
    expect(res.status).toBe(200);
    expect(plan.monthlyCredits).toBe(200);
  });
});

describe("DELETE (deactivate)", () => {
  it("deactivates and reports who is still being charged", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/plans/p1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ activeSubscribers: 3, recurringSubscribers: 3 });
  });
});
