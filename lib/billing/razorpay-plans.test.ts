import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@prisma/client";

// Razorpay Plans are immutable, so a price edit has to mint a replacement. The
// 2026-09 pricing audit found the only sync path (scripts/razorpay-sync-plans.ts)
// deliberately SKIPPED already-synced plans, which meant /pricing could advertise
// a price the subscription would never actually charge.

const created: Array<{ amount: number; currency: string; period: string; name: string }> = [];
let createShouldFail = false;

vi.mock("razorpay", () => ({
  default: class {
    plans = {
      create: async (args: { period: string; item: { name: string; amount: number; currency: string } }) => {
        if (createShouldFail) throw new Error("razorpay down");
        created.push({
          amount: args.item.amount,
          currency: args.item.currency,
          period: args.period,
          name: args.item.name,
        });
        return { id: `plan_rzp_${created.length}` };
      },
    };
  },
}));

const planUpdates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        planUpdates.push(data);
        return {};
      }),
    },
    // lib/currency reads FX / price-book overrides from Config; absent here, so
    // the tested behaviour is the shipped default price book.
    config: { findUnique: vi.fn(async () => null) },
  },
}));

const { syncRazorpayPlan, resyncPricedCurrencies, storedPlanId } = await import("./razorpay-plans");

function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    slug: "sub_creator_1mo",
    name: "Creator (Monthly)",
    priceInPaise: 99900,
    currency: "INR",
    credits: 60,
    features: [],
    active: true,
    sortOrder: 10,
    kind: "subscription",
    razorpayPlanIdInr: null,
    razorpayPlanIdUsd: null,
    intervalMonths: 1,
    monthlyCredits: 60,
    tier: "creator",
    createdAt: new Date(),
    ...over,
  } as Plan;
}

beforeEach(() => {
  created.length = 0;
  planUpdates.length = 0;
  createShouldFail = false;
});

describe("syncRazorpayPlan", () => {
  it("provisions an unsynced plan and stores the id on the right column", async () => {
    const res = await syncRazorpayPlan(makePlan(), "INR");
    expect(res).toMatchObject({ ok: true, created: true });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ amount: 99900, currency: "INR", period: "monthly" });
    expect(planUpdates[0]).toEqual({ razorpayPlanIdInr: "plan_rzp_1" });
  });

  it("is idempotent — an already-synced currency is left alone", async () => {
    const res = await syncRazorpayPlan(makePlan({ razorpayPlanIdInr: "plan_existing" }), "INR");
    expect(res).toMatchObject({ ok: true, created: false, razorpayPlanId: "plan_existing" });
    expect(created).toHaveLength(0);
    expect(planUpdates).toHaveLength(0);
  });

  it("force re-mints an already-synced currency (the price-change path)", async () => {
    const res = await syncRazorpayPlan(
      makePlan({ razorpayPlanIdInr: "plan_old", priceInPaise: 129900 }),
      "INR",
      { force: true },
    );
    expect(res).toMatchObject({ ok: true, created: true });
    expect(created[0].amount).toBe(129900);
    expect(planUpdates[0]).toEqual({ razorpayPlanIdInr: "plan_rzp_1" });
  });

  it("prices USD from the price book, never the raw paise figure", async () => {
    await syncRazorpayPlan(makePlan(), "USD");
    // $15.00, not 99900 "cents" ($999) — the bug this guards against.
    expect(created[0]).toMatchObject({ amount: 1500, currency: "USD" });
    expect(planUpdates[0]).toEqual({ razorpayPlanIdUsd: "plan_rzp_1" });
  });

  it("bills a 12-month SKU yearly, matching what its price represents", async () => {
    await syncRazorpayPlan(makePlan({ slug: "sub_creator_12mo", intervalMonths: 12, priceInPaise: 803200 }), "INR");
    expect(created[0]).toMatchObject({ period: "yearly", amount: 803200 });
  });

  it("reports a provider failure instead of storing a bogus id", async () => {
    createShouldFail = true;
    const res = await syncRazorpayPlan(makePlan(), "INR");
    expect(res.ok).toBe(false);
    expect(planUpdates).toHaveLength(0);
  });

  it("refuses a pack — packs are one-time orders, not Razorpay Plans", async () => {
    const res = await syncRazorpayPlan(makePlan({ kind: "pack", intervalMonths: null }), "INR");
    expect(res.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("resyncPricedCurrencies", () => {
  it("re-mints only the currencies already live, leaving unsynced ones unsynced", async () => {
    // Syncing USD here would silently switch the plan onto recurring billing in a
    // currency nobody chose, as a side effect of an INR price edit.
    const outcomes = await resyncPricedCurrencies(makePlan({ razorpayPlanIdInr: "plan_old", priceInPaise: 129900 }));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ ok: true, currency: "INR" });
    expect(created).toHaveLength(1);
    expect(created[0].currency).toBe("INR");
  });

  it("does nothing for a plan that was never synced", async () => {
    expect(await resyncPricedCurrencies(makePlan())).toEqual([]);
    expect(created).toHaveLength(0);
  });

  it("skips a currency whose charged amount did not actually move", async () => {
    // USD is price-book anchored ($29 for sub_pro_1mo), so an INR price edit
    // leaves the USD charge identical — re-minting would just churn a duplicate
    // Razorpay plan at the same amount on every save.
    const outcomes = await resyncPricedCurrencies(
      makePlan({ slug: "sub_pro_1mo", razorpayPlanIdInr: "plan_inr", razorpayPlanIdUsd: "plan_usd", priceInPaise: 249900 }),
      219900,
    );
    expect(outcomes.find((o) => o.currency === "USD")).toMatchObject({ ok: true, created: false, razorpayPlanId: "plan_usd" });
    expect(outcomes.find((o) => o.currency === "INR")).toMatchObject({ ok: true, created: true });
    expect(created.map((c) => c.currency)).toEqual(["INR"]);
  });
});

describe("storedPlanId", () => {
  it("reads the per-currency column", () => {
    const plan = makePlan({ razorpayPlanIdInr: "a", razorpayPlanIdUsd: "b" });
    expect(storedPlanId(plan, "INR")).toBe("a");
    expect(storedPlanId(plan, "USD")).toBe("b");
  });
});
