import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression cover for the 2026-09 pricing audit's P0: the admin plan-assign
// path used to write User.credits (the DENORMALIZED total of the three bucket
// columns) directly. spendCredits recomputes that total from the buckets, so
// the granted balance was visible in the UI but unspendable, then silently
// vanished on the first spend — and no CreditTransaction row was ever written,
// so refunds (which are ledger-driven) couldn't see it either.
//
// These tests exercise the REAL lib/credits helpers against a bucket-aware
// prisma mock, so an absolute `credits` write would show up as buckets that
// don't add up to the total.

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

const cancelMock = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/lib/billing/subscription-switch", () => ({
  cancelExistingSubscriptionForSwitch: (...args: unknown[]) => cancelMock(...(args as [])),
}));

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  bonusCredits: number;
  subscriptionCredits: number;
  purchasedCredits: number;
  monthlyCredits: number;
  planId: string | null;
  subscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  subscriptionCancelledAt: Date | null;
  subscriptionEndsAt: Date | null;
  nextRefillAt: Date | null;
  freeCreditsRefillAt: Date | null;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  credits: number;
  intervalMonths: number | null;
  monthlyCredits: number | null;
}

let user: UserRow;
let plans: PlanRow[];
let ledger: Array<{ bucket: string; delta: number; reason: string }>;

// Applies a Prisma `data` payload, honouring the { increment } form the real
// lib/credits.ts uses, so bucket arithmetic in the mock matches production.
function applyData(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) {
      row[k] = (row[k] as number) + (v as { increment: number }).increment;
    } else if (v && typeof v === "object" && "decrement" in (v as object)) {
      row[k] = (row[k] as number) - (v as { decrement: number }).decrement;
    } else {
      row[k] = v;
    }
  }
}

vi.mock("@/lib/prisma", () => {
  const client = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        // Email-uniqueness probe: nobody else owns it in these tests.
        if (where.email !== undefined) return null;
        return where.id === user.id ? user : null;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        applyData(user as unknown as Record<string, unknown>, data);
        return user;
      }),
    },
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        plans.find((p) => p.id === where.id || p.slug === where.slug) ?? null),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: { bucket: string; delta: number; reason: string } }) => {
        ledger.push({ bucket: data.bucket, delta: data.delta, reason: data.reason });
        return data;
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    // lockUserRow's SELECT ... FOR UPDATE
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return { prisma: client };
});

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const { PATCH } = await import("./route");

const patch = (body: unknown, id = "u1") =>
  PATCH(
    new NextRequest("http://localhost/api/admin/users/u1", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

/** The invariant the whole bucket split rests on. */
const bucketsAddUp = () =>
  user.credits === user.bonusCredits + user.subscriptionCredits + user.purchasedCredits;

beforeEach(() => {
  user = {
    id: "u1", email: "u1@test.co", name: null, role: "USER",
    credits: 30, bonusCredits: 10, subscriptionCredits: 0, purchasedCredits: 20,
    monthlyCredits: 0,
    planId: null, subscriptionId: null, razorpaySubscriptionId: null,
    subscriptionCancelledAt: null, subscriptionEndsAt: null, nextRefillAt: null,
    freeCreditsRefillAt: new Date(),
  };
  plans = [
    { id: "plan-pro", name: "Pro (Monthly)", slug: "sub_pro_1mo", kind: "subscription", credits: 160, intervalMonths: 1, monthlyCredits: 160 },
    { id: "plan-year", name: "Studio (Yearly)", slug: "sub_studio_12mo", kind: "subscription", credits: 4800, intervalMonths: 12, monthlyCredits: 400 },
    { id: "pack-mini", name: "Mini Pack", slug: "pack_mini", kind: "pack", credits: 30, intervalMonths: null, monthlyCredits: null },
  ];
  ledger = [];
  cancelMock.mockClear();
  cancelMock.mockResolvedValue({ ok: true as const });
});

describe("assigning a subscription plan", () => {
  it("grants the monthly credits into the subscription bucket, not the bare total", async () => {
    const res = await patch({ planId: "plan-pro" });
    expect(res.status).toBe(200);

    expect(user.subscriptionCredits).toBe(160);
    expect(user.credits).toBe(190); // 30 existing + 160 granted
    expect(bucketsAddUp()).toBe(true);
    // Untouched buckets stay untouched.
    expect(user.bonusCredits).toBe(10);
    expect(user.purchasedCredits).toBe(20);
  });

  it("records the grant in the credit ledger", async () => {
    await patch({ planId: "plan-pro" });
    expect(ledger).toContainEqual({ bucket: "subscription", delta: 160, reason: "grant:admin-plan-assign" });
  });

  it("applies the plan's subscription state and leaves the free-tier drip", async () => {
    await patch({ planId: "plan-pro" });
    expect(user.planId).toBe("plan-pro");
    expect(user.subscriptionEndsAt).toBeInstanceOf(Date);
    expect(user.monthlyCredits).toBe(160);
    // 1-month terms are not cron-refilled; renewal is a new payment.
    expect(user.nextRefillAt).toBeNull();
    expect(user.freeCreditsRefillAt).toBeNull();
  });

  it("grants ONE month on a yearly plan, not the term total", async () => {
    await patch({ planId: "plan-year" });
    expect(user.subscriptionCredits).toBe(400);
    expect(user.nextRefillAt).toBeInstanceOf(Date); // multi-month terms do cron-refill
    expect(bucketsAddUp()).toBe(true);
  });

  it("returns 404 for an unknown plan without touching the balance", async () => {
    const res = await patch({ planId: "nope" });
    expect(res.status).toBe(404);
    expect(user.credits).toBe(30);
    expect(ledger).toHaveLength(0);
  });
});

describe("assigning a credit pack", () => {
  it("grants purchased credits and does NOT set planId", async () => {
    const res = await patch({ planId: "pack-mini" });
    expect(res.status).toBe(200);

    expect(user.purchasedCredits).toBe(50); // 20 + 30
    expect(bucketsAddUp()).toBe(true);
    expect(ledger).toContainEqual({ bucket: "purchased", delta: 30, reason: "grant:admin-pack-assign" });
    // A pack carries no tier, so a non-null planId would grant nothing while
    // permanently excluding the account from the free-tier monthly drip.
    expect(user.planId).toBeNull();
    expect(user.freeCreditsRefillAt).not.toBeNull();
  });
});

describe("removing a user's plan", () => {
  beforeEach(() => {
    user.planId = "plan-pro";
    user.monthlyCredits = 160;
    user.razorpaySubscriptionId = "sub_live_1";
    user.subscriptionEndsAt = new Date(Date.now() + 20 * 86400_000);
    user.subscriptionCredits = 100;
    user.credits = 130; // 10 bonus + 100 subscription + 20 purchased
  });

  it("cancels the Razorpay mandate and drops the local link", async () => {
    const res = await patch({ planId: null });
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith("u1", "sub_live_1");
    expect(user.razorpaySubscriptionId).toBeNull();
    expect(user.planId).toBeNull();
    expect(user.subscriptionEndsAt).toBeNull();
  });

  it("zeroes the subscription bucket but keeps purchased and bonus credits", async () => {
    await patch({ planId: null });
    expect(user.subscriptionCredits).toBe(0);
    expect(user.purchasedCredits).toBe(20);
    expect(user.bonusCredits).toBe(10);
    expect(user.credits).toBe(30);
    expect(bucketsAddUp()).toBe(true);
    expect(ledger).toContainEqual({ bucket: "subscription", delta: -100, reason: "lapse:admin-plan-removed" });
  });

  it("re-anchors the free-tier monthly drip", async () => {
    await patch({ planId: null });
    expect(user.freeCreditsRefillAt).toBeInstanceOf(Date);
    expect(user.freeCreditsRefillAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses with 502 and changes nothing when the provider cancel fails", async () => {
    cancelMock.mockResolvedValue({ ok: false, error: "boom", status: 502 } as never);
    const res = await patch({ planId: null });
    expect(res.status).toBe(502);
    // The link is left intact so the next attempt can retry, rather than
    // orphaning a live mandate against a free-tier account.
    expect(user.razorpaySubscriptionId).toBe("sub_live_1");
    expect(user.planId).toBe("plan-pro");
    expect(user.subscriptionCredits).toBe(100);
  });
});

describe("schema", () => {
  it("rejects an absolute `credits` write (the field no longer exists)", async () => {
    const res = await patch({ credits: 99999 });
    expect(res.status).toBe(400);
    expect(user.credits).toBe(30);
  });
});
