import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-ins for the rows lib/creator-program.ts touches.
interface Aff {
  id: string; userId: string; status: string; isCreatorPartner: boolean; creatorHandle: string | null;
  creatorGoalReachedAt: Date | null; creatorRewardGrantedAt: Date | null; creatorRewardGrantedBy?: string | null;
}
interface Ref {
  id: string; affiliateId: string; referredUserId: string; status: string;
  qualifiedAt: Date | null; qualifyingTier: string | null; qualifyingPaymentId: string | null;
}

let config: string | null;
let affiliates: Map<string, Aff>;
let referrals: Ref[];
let purchases: { userId: string; amountInPaise: number }[];
let users: Map<string, { razorpaySubscriptionId: string | null; subscriptionEndsAt: Date | null; planId?: string }>;
let plans: { id: string; name: string; kind: string; tier: string; intervalMonths: number; active: boolean; monthlyCredits: number; credits: number; monthlyMinutes: number; sortOrder: number }[];

const notify = vi.fn(async () => {});
const notifyAdmins = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: (...a: unknown[]) => notify(...(a as [])), notifyAdmins: (...a: unknown[]) => notifyAdmins(...(a as [])) }));
const grantCredits = vi.fn(async () => {});
const grantMinutes = vi.fn(async () => {});
vi.mock("@/lib/credits", () => ({ grantCredits: (...a: unknown[]) => grantCredits(...(a as [])) }));
vi.mock("@/lib/minutes", () => ({ grantMinutes: (...a: unknown[]) => grantMinutes(...(a as [])) }));

const withAff = (r: Ref) => ({ ...r, affiliate: affiliates.get(r.affiliateId)! });
const matches = (r: Ref, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => {
    const val = (r as unknown as Record<string, unknown>)[k];
    if (v && typeof v === "object" && "not" in (v as object)) return val !== (v as { not: unknown }).not;
    return val === v;
  });

const db = {
  config: {
    findUnique: vi.fn(async () => (config ? { key: "creator_program", value: config } : null)),
    upsert: vi.fn(async ({ create }: { create: { value: string } }) => { config = create.value; }),
  },
  referral: {
    findUnique: vi.fn(async ({ where }: { where: { referredUserId: string } }) => {
      const r = referrals.find((x) => x.referredUserId === where.referredUserId);
      return r ? withAff(r) : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Ref> }) => {
      const hit = referrals.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => referrals.filter((r) => matches(r, where)).length),
  },
  affiliate: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const a = affiliates.get(where.id);
      return a ? { ...a, user: users.get(a.userId) } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string } & Record<string, unknown>; data: Partial<Aff> }) => {
      const a = affiliates.get(where.id);
      const ok = a && Object.entries(where).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v);
      if (ok) Object.assign(a!, data);
      return { count: ok ? 1 : 0 };
    }),
  },
  purchase: {
    findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => purchases.find((p) => p.userId === where.userId && p.amountInPaise > 0) ?? null),
  },
  plan: {
    findFirst: vi.fn(async () => plans.find((p) => p.kind === "subscription" && p.tier === "pro" && p.intervalMonths === 12 && p.active) ?? null),
  },
  user: {
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(users.get(where.id)!, data);
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mod = await import("@/lib/creator-program");
const OFFER = "offer_ABCDEFGHIJ1234";

function addReferral(i: number, affiliateId = "aff-c", status = "signed_up") {
  referrals.push({ id: `ref-${i}`, affiliateId, referredUserId: `u-${i}`, status, qualifiedAt: null, qualifyingTier: null, qualifyingPaymentId: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  config = null;
  affiliates = new Map([
    ["aff-c", { id: "aff-c", userId: "creator-user", status: "active", isCreatorPartner: true, creatorHandle: "@maya", creatorGoalReachedAt: null, creatorRewardGrantedAt: null }],
    ["aff-n", { id: "aff-n", userId: "normal-user", status: "active", isCreatorPartner: false, creatorHandle: null, creatorGoalReachedAt: null, creatorRewardGrantedAt: null }],
  ]);
  referrals = [];
  purchases = [];
  users = new Map([
    ["creator-user", { razorpaySubscriptionId: null, subscriptionEndsAt: null }],
    ["normal-user", { razorpaySubscriptionId: null, subscriptionEndsAt: null }],
  ]);
  plans = [{ id: "plan-pro-y", name: "Pro Yearly", kind: "subscription", tier: "pro", intervalMonths: 12, active: true, monthlyCredits: 400, credits: 4800, monthlyMinutes: 300, sortOrder: 1 }];
});

describe("normalizeCreatorProgram", () => {
  it("falls back to defaults field by field", () => {
    expect(mod.normalizeCreatorProgram(null)).toEqual(mod.DEFAULT_CREATOR_PROGRAM);
    const s = mod.normalizeCreatorProgram({ discountPct: 99, goal: 0, razorpayOfferId: "nope", qualifyingTiers: ["pro", "bogus" as never] });
    expect(s.discountPct).toBe(10);
    expect(s.goal).toBe(10);
    expect(s.razorpayOfferId).toBeNull();
    expect(s.qualifyingTiers).toEqual(["pro"]);
  });

  it("keeps a valid offer id", () => {
    expect(mod.normalizeCreatorProgram({ razorpayOfferId: ` ${OFFER} ` }).razorpayOfferId).toBe(OFFER);
  });
});

describe("creatorDiscountFor", () => {
  beforeEach(() => addReferral(1));

  it("is null until an offer id is configured", async () => {
    expect(await mod.creatorDiscountFor("u-1")).toBeNull();
  });

  it("gives a creator partner's referral the discount on their first payment", async () => {
    await mod.setCreatorProgram({ razorpayOfferId: OFFER });
    expect(await mod.creatorDiscountFor("u-1")).toEqual({ affiliateId: "aff-c", creatorHandle: "@maya", discountPct: 10, razorpayOfferId: OFFER });
  });

  it("is null once they have paid for anything", async () => {
    await mod.setCreatorProgram({ razorpayOfferId: OFFER });
    purchases.push({ userId: "u-1", amountInPaise: 49900 });
    expect(await mod.creatorDiscountFor("u-1")).toBeNull();
  });

  it("is null for an ordinary affiliate's referral, a flagged one, or a suspended creator", async () => {
    await mod.setCreatorProgram({ razorpayOfferId: OFFER });
    addReferral(2, "aff-n");
    addReferral(3, "aff-c", "flagged");
    expect(await mod.creatorDiscountFor("u-2")).toBeNull();
    expect(await mod.creatorDiscountFor("u-3")).toBeNull();
    affiliates.get("aff-c")!.status = "suspended";
    expect(await mod.creatorDiscountFor("u-1")).toBeNull();
  });

  it("is null when the programme is off", async () => {
    await mod.setCreatorProgram({ razorpayOfferId: OFFER, enabled: false });
    expect(await mod.creatorDiscountFor("u-1")).toBeNull();
  });
});

describe("recordCreatorQualifyingSale", () => {
  it("counts a Pro or Studio purchase once, and ignores lower tiers", async () => {
    addReferral(1);
    addReferral(2);
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "pay_1", tier: "pro" });
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "pay_2", tier: "studio" });
    await mod.recordCreatorQualifyingSale({ userId: "u-2", paymentId: "pay_3", tier: "creator" });
    expect(referrals[0]).toMatchObject({ qualifyingTier: "pro", qualifyingPaymentId: "pay_1" });
    expect(referrals[0].qualifiedAt).toBeInstanceOf(Date);
    expect(referrals[1].qualifiedAt).toBeNull();
  });

  it("doesn't count for an ordinary affiliate or a flagged referral", async () => {
    addReferral(1, "aff-n");
    addReferral(2, "aff-c", "flagged");
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "pay_1", tier: "pro" });
    await mod.recordCreatorQualifyingSale({ userId: "u-2", paymentId: "pay_2", tier: "pro" });
    expect(referrals.every((r) => r.qualifiedAt === null)).toBe(true);
  });

  it("notifies admins and the creator exactly once when the goal is reached", async () => {
    await mod.setCreatorProgram({ goal: 2 });
    for (let i = 1; i <= 3; i++) addReferral(i);
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "p1", tier: "pro" });
    expect(notifyAdmins).not.toHaveBeenCalled();
    await mod.recordCreatorQualifyingSale({ userId: "u-2", paymentId: "p2", tier: "studio" });
    await mod.recordCreatorQualifyingSale({ userId: "u-3", paymentId: "p3", tier: "pro" });
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(affiliates.get("aff-c")!.creatorGoalReachedAt).toBeInstanceOf(Date);
  });
});

describe("unqualifyRefundedPayment", () => {
  it("un-counts the referral whose qualifying payment was refunded", async () => {
    addReferral(1);
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "pay_1", tier: "pro" });
    await mod.unqualifyRefundedPayment("pay_1");
    expect(referrals[0]).toMatchObject({ qualifiedAt: null, qualifyingTier: null, qualifyingPaymentId: null });
    expect(await mod.countQualified("aff-c")).toBe(0);
  });
});

describe("grantCreatorReward", () => {
  async function reachGoal() {
    await mod.setCreatorProgram({ goal: 2 });
    addReferral(1);
    addReferral(2);
    await mod.recordCreatorQualifyingSale({ userId: "u-1", paymentId: "p1", tier: "pro" });
    await mod.recordCreatorQualifyingSale({ userId: "u-2", paymentId: "p2", tier: "pro" });
  }

  it("refuses before the goal", async () => {
    const r = await mod.grantCreatorReward("aff-c", "admin-1");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("grants the yearly Pro plan once", async () => {
    await reachGoal();
    const r = await mod.grantCreatorReward("aff-c", "admin-1");
    expect(r.ok).toBe(true);
    expect(users.get("creator-user")!.planId).toBe("plan-pro-y");
    expect(grantCredits).toHaveBeenCalledWith(expect.objectContaining({ userId: "creator-user", amount: 400, reason: "grant:creator-reward" }));
    expect(grantMinutes).toHaveBeenCalledWith(expect.objectContaining({ amount: 300 }));
    expect(affiliates.get("aff-c")!.creatorRewardGrantedBy).toBe("admin-1");
    const again = await mod.grantCreatorReward("aff-c", "admin-1");
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(grantCredits).toHaveBeenCalledTimes(1);
  });

  it("refuses while the creator pays for a live subscription", async () => {
    await reachGoal();
    users.set("creator-user", { razorpaySubscriptionId: "sub_1", subscriptionEndsAt: new Date(Date.now() + 86_400_000) });
    const r = await mod.grantCreatorReward("aff-c", "admin-1");
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("refuses a non-partner", async () => {
    expect(await mod.grantCreatorReward("aff-n", "admin-1")).toMatchObject({ ok: false, status: 409 });
  });
});
