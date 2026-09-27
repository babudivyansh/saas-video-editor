// Clip Minutes engine, against a REAL database: the spend is a hand-written
// UPDATE ... FROM (SELECT ... FOR UPDATE), and a mocked $queryRaw would only
// test the mock. Skips cleanly when no database is reachable.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// Spends fire the low-minutes email hook; a test user must never send mail.
vi.mock("@/lib/minute-events", () => ({ fireLowMinutesEmail: vi.fn() }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const { prisma } = await import("@/lib/prisma");
const m = await import("@/lib/minutes");

const RUN = randomUUID().slice(0, 8);
let userId = "";
let dbUp = true;

beforeAll(async () => {
  try {
    userId = (await prisma.user.create({
      data: { email: `minutes-${RUN}@test.invalid`, passwordHash: "x" },
      select: { id: true },
    })).id;
  } catch (e) {
    dbUp = false;
    // eslint-disable-next-line no-console
    console.warn("minutes suite skipped — no database:", String(e).split("\n")[0]);
  }
}, 60_000);

afterAll(async () => {
  if (dbUp) await prisma.user.deleteMany({ where: { email: `minutes-${RUN}@test.invalid` } });
});

async function reset(b: { bonus?: number; subscription?: number; purchased?: number; credits?: number }) {
  await prisma.minuteTransaction.deleteMany({ where: { userId } });
  const bonus = b.bonus ?? 0, subscription = b.subscription ?? 0, purchased = b.purchased ?? 0;
  await prisma.user.update({
    where: { id: userId },
    data: {
      bonusMinutes: bonus, subscriptionMinutes: subscription, purchasedMinutes: purchased,
      minutes: bonus + subscription + purchased,
      // Credits are set to a sentinel so any cross-meter leak is visible.
      bonusCredits: 0, subscriptionCredits: b.credits ?? 7, purchasedCredits: 0, credits: b.credits ?? 7,
    },
  });
}

async function row() {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { minutes: true, bonusMinutes: true, subscriptionMinutes: true, purchasedMinutes: true, credits: true, subscriptionCredits: true },
  });
}

describe("billableSourceMinutes", () => {
  it("rounds a partial minute up and never bills zero", () => {
    expect(m.billableSourceMinutes(60)).toBe(1);
    expect(m.billableSourceMinutes(61)).toBe(2);
    expect(m.billableSourceMinutes(12)).toBe(1);
    expect(m.billableSourceMinutes(0)).toBe(1);
    expect(m.billableSourceMinutes(Number.NaN)).toBe(1);
    expect(m.billableSourceMinutes(3600)).toBe(60);
  });
});

describe.skipIf(!dbUp)("Clip Minutes engine (real database)", () => {
  beforeEach(async () => { if (dbUp) await reset({}); });

  it("drains bonus, then subscription, then purchased, and keeps the total in step", async () => {
    await reset({ bonus: 5, subscription: 10, purchased: 20 });
    const r = await m.spendMinutes({ userId, amount: 12, reason: "spend:test", refId: `a-${RUN}` });
    expect(r.ok).toBe(true);
    expect(await row()).toMatchObject({ bonusMinutes: 0, subscriptionMinutes: 3, purchasedMinutes: 20, minutes: 23 });
  });

  it("refuses an overdraw without touching anything", async () => {
    await reset({ bonus: 1, subscription: 1, purchased: 1 });
    const r = await m.spendMinutes({ userId, amount: 4, reason: "spend:test", refId: `b-${RUN}` });
    expect(r).toMatchObject({ ok: false, reason: "insufficient_minutes" });
    expect(await row()).toMatchObject({ minutes: 3, bonusMinutes: 1, subscriptionMinutes: 1, purchasedMinutes: 1 });
    expect(await prisma.minuteTransaction.count({ where: { userId } })).toBe(0);
  });

  it("never touches credits — the two meters are independent", async () => {
    await reset({ subscription: 30, credits: 7 });
    await m.spendMinutes({ userId, amount: 10, reason: "spend:test", refId: `c-${RUN}` });
    await m.grantMinutes({ userId, bucket: "purchased", amount: 5, reason: "grant:test" });
    expect(await row()).toMatchObject({ credits: 7, subscriptionCredits: 7 });
    expect(await prisma.creditTransaction.count({ where: { userId } })).toBe(0);
  });

  it("refunds a failed run into exactly the buckets it drained, once", async () => {
    await reset({ bonus: 2, subscription: 3, purchased: 10 });
    const refId = `auto-clip:${RUN}`;
    await m.spendMinutes({ userId, amount: 8, reason: "spend:auto-clip", refId });
    expect(await m.restoreMinutes({ userId, refId, reason: "refund:test" })).toBe(8);
    expect(await row()).toMatchObject({ bonusMinutes: 2, subscriptionMinutes: 3, purchasedMinutes: 10, minutes: 15 });
    // A second refund of the same run pays out nothing.
    expect(await m.restoreMinutes({ userId, refId, reason: "refund:test" })).toBe(0);
    expect((await row()).minutes).toBe(15);
  });

  it("partial refunds never exceed what was taken", async () => {
    await reset({ purchased: 20 });
    const refId = `partial-${RUN}`;
    await m.spendMinutes({ userId, amount: 10, reason: "spend:auto-clip", refId });
    expect(await m.restoreMinutes({ userId, refId, amount: 4 })).toBe(4);
    expect(await m.restoreMinutes({ userId, refId, amount: 100 })).toBe(6);
    expect((await row()).minutes).toBe(20);
  });

  it("two concurrent refunds of one run pay out once", async () => {
    await reset({ purchased: 10 });
    const refId = `race-${RUN}`;
    await m.spendMinutes({ userId, amount: 10, reason: "spend:auto-clip", refId });
    const [a, b] = await Promise.all([m.restoreMinutes({ userId, refId }), m.restoreMinutes({ userId, refId })]);
    expect(a + b).toBe(10);
    expect((await row()).minutes).toBe(10);
  });

  it("caps the monthly subscription grant at 2x (rollover)", async () => {
    await reset({ subscription: 250 });
    expect(await m.grantMonthlyMinutes({ userId, monthlyMinutes: 150, reason: "grant:refill" })).toBe(50);
    expect((await row()).subscriptionMinutes).toBe(300);
    expect(await m.grantMonthlyMinutes({ userId, monthlyMinutes: 150, reason: "grant:refill" })).toBe(0);
  });

  it("zeroes subscription minutes on lapse but keeps purchased and bonus", async () => {
    await reset({ bonus: 4, subscription: 90, purchased: 30 });
    await m.setSubscriptionMinutes(userId, 0, "lapse");
    expect(await row()).toMatchObject({ bonusMinutes: 4, subscriptionMinutes: 0, purchasedMinutes: 30, minutes: 34 });
  });

  it("expires the bonus bucket", async () => {
    await reset({ bonus: 30, purchased: 5 });
    expect(await m.expireBonusMinutes(userId)).toBe(30);
    expect(await row()).toMatchObject({ bonusMinutes: 0, minutes: 5 });
  });

  it("clawback floors at zero and takes purchased first", async () => {
    await reset({ bonus: 1, subscription: 2, purchased: 3 });
    expect(await m.clawbackMinutes({ userId, amount: 100, reason: "clawback:refund" })).toBe(6);
    expect((await row()).minutes).toBe(0);
  });
});
