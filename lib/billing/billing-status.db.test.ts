// billingStatusWhere against a REAL database: every seeded account must land
// in exactly the status billingStatusOf gives it — the Prisma filters and the
// pure rules can't drift apart. Skips cleanly when no database is reachable.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

const { prisma } = await import("@/lib/prisma");
const { BILLING_STATUSES, billingStatusOf, billingStatusWhere } = await import("./billing-status");

const RUN = randomUUID().slice(0, 8);
const NOW = new Date();
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const ids: string[] = [];
let planId: string | null = null;
let dbUp = true;

const CASES = {
  trial: { trialEndsAt: at(2), subscriptionEndsAt: at(2), plan: true },
  trial_cancelled: { trialEndsAt: at(2), subscriptionEndsAt: at(2), subscriptionCancelledAt: at(-1), plan: true },
  paid: { subscriptionEndsAt: at(20), plan: true, paid: true },
  paid_cancelling: { subscriptionEndsAt: at(20), subscriptionCancelledAt: at(-1), plan: true, paid: true },
  payment_failed: { subscriptionEndsAt: at(20), paymentFailedAt: at(-1), plan: true, paid: true },
  lapsed: { subscriptionEndsAt: at(-5), trialEndsAt: at(-9), plan: true, paid: true },
  free: {},
} as const;

beforeAll(async () => {
  try {
    const plan = await prisma.plan.findFirst({ select: { id: true } });
    planId = plan?.id ?? null;
    for (const [tag, c] of Object.entries(CASES)) {
      const u = await prisma.user.create({
        data: {
          email: `billing-${tag}-${RUN}@test.invalid`,
          passwordHash: "x",
          planId: "plan" in c && c.plan ? planId : null,
          subscriptionEndsAt: "subscriptionEndsAt" in c ? c.subscriptionEndsAt : null,
          subscriptionCancelledAt: "subscriptionCancelledAt" in c ? c.subscriptionCancelledAt : null,
          trialEndsAt: "trialEndsAt" in c ? c.trialEndsAt : null,
          paymentFailedAt: "paymentFailedAt" in c ? c.paymentFailedAt : null,
        },
      });
      ids.push(u.id);
      if ("paid" in c && c.paid) {
        await prisma.purchase.create({ data: { id: `pay_${tag}_${RUN}`, userId: u.id, amountInPaise: 49900, credits: 0 } });
      }
    }
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.purchase.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("billingStatusWhere (database)", () => {
  it("puts every account in exactly one status, the one billingStatusOf gives", async (ctx) => {
    if (!dbUp || !planId) ctx.skip();
    const seen = new Map<string, string[]>();
    for (const s of BILLING_STATUSES) {
      const rows = await prisma.user.findMany({ where: { AND: [{ id: { in: ids } }, billingStatusWhere(s, NOW)] }, select: { email: true } });
      for (const r of rows) seen.set(r.email, [...(seen.get(r.email) ?? []), s]);
    }
    for (const tag of Object.keys(CASES)) {
      expect(seen.get(`billing-${tag}-${RUN}@test.invalid`), tag).toEqual([tag]);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        email: true, planId: true, subscriptionEndsAt: true, subscriptionCancelledAt: true, trialEndsAt: true, paymentFailedAt: true,
        _count: { select: { purchases: true } },
      },
    });
    for (const u of users) {
      expect(billingStatusOf(u, u._count.purchases > 0, NOW), u.email).toBe(seen.get(u.email)?.[0]);
    }
  });
});
