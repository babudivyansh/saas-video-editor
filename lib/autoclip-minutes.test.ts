// AutoClip's Clip Minutes charge, against a REAL database — both ledgers,
// real projects, real row locks. Skips cleanly when no database is reachable.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));
// spendCredits fires post-spend emails and an auto-topup check through dynamic
// imports; neither belongs in a ledger test.
vi.mock("@/lib/credit-events", () => ({ firePostCreditSpendEmails: vi.fn(), fireZeroCreditsEmail: vi.fn() }));

const { prisma } = await import("@/lib/prisma");
const am = await import("@/lib/autoclip-minutes");

const RUN = randomUUID().slice(0, 8);
const EMAIL = `ac-minutes-${RUN}@test.invalid`;
const SRC = `https://bucket.s3.amazonaws.com/uploads/${RUN}/source.mp4`;
let userId = "";
let dbUp = true;
let n = 0;

beforeAll(async () => {
  try {
    userId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "x" }, select: { id: true } })).id;
  } catch (e) {
    dbUp = false;
    // eslint-disable-next-line no-console
    console.warn("autoclip-minutes suite skipped — no database:", String(e).split("\n")[0]);
  }
}, 60_000);

afterAll(async () => {
  if (!dbUp) return;
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

async function balances(minutes: number, credits: number) {
  await prisma.minuteTransaction.deleteMany({ where: { userId } });
  await prisma.creditTransaction.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      bonusMinutes: 0, subscriptionMinutes: minutes, purchasedMinutes: 0, minutes,
      bonusCredits: 0, subscriptionCredits: credits, purchasedCredits: 0, credits,
    },
  });
}

async function project(src = SRC) {
  return (await prisma.project.create({
    data: { userId, title: `p${++n}`, uploadedVideoUrl: src, productType: "auto-clip" },
    select: { id: true },
  })).id;
}

const me = () => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { minutes: true, credits: true } });

describe.skipIf(!dbUp)("chargeRunMinutes (real database)", () => {
  beforeEach(async () => { if (dbUp) await balances(100, 50); });

  it("bills whole source minutes, rounded up", async () => {
    const p = await project();
    const r = await am.chargeRunMinutes({ userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 61 * 10 });
    expect(r).toMatchObject({ ok: true, minutes: 11, overflowCredits: 0 });
    expect(await me()).toMatchObject({ minutes: 89, credits: 50 });
  });

  it("does not charge twice when the pick job retries", async () => {
    const p = await project();
    await am.chargeRunMinutes({ userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 600 });
    const again = await am.chargeRunMinutes({ userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 600 });
    expect(again).toMatchObject({ ok: true, alreadyCharged: true });
    expect((await me()).minutes).toBe(90);
  });

  it("refuses a shortfall without the opt-in, charging nothing", async () => {
    await balances(5, 50);
    const p = await project();
    const r = await am.chargeRunMinutes({ userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 20 * 60 });
    expect(r).toEqual({ ok: false, needed: 20, available: 5, overflowCredits: 5 });
    expect(await me()).toMatchObject({ minutes: 5, credits: 50 });
  });

  it("with the opt-in, uses every minute and pays the rest in credits (3 min = 1 credit)", async () => {
    await balances(5, 50);
    const p = await project();
    const r = await am.chargeRunMinutes({
      userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 20 * 60, allowCreditOverflow: true,
    });
    expect(r).toMatchObject({ ok: true, minutes: 5, overflowCredits: 5 });
    expect(await me()).toMatchObject({ minutes: 0, credits: 45 });
  });

  it("hands the minutes back if the credit half of an overflow can't be paid", async () => {
    await balances(5, 1);
    const p = await project();
    const r = await am.chargeRunMinutes({
      userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 20 * 60, allowCreditOverflow: true,
    });
    expect(r.ok).toBe(false);
    expect(await me()).toMatchObject({ minutes: 5, credits: 1 });
  });

  it("refundRunMinutes returns minutes AND overflow credits, exactly once", async () => {
    await balances(5, 50);
    const p = await project();
    await am.chargeRunMinutes({ userId, projectId: p, uploadedVideoUrl: SRC, durationSec: 20 * 60, allowCreditOverflow: true });
    expect(await am.refundRunMinutes(userId, p, "refund:test")).toEqual({ minutes: 5, credits: 5 });
    expect(await am.refundRunMinutes(userId, p, "refund:test")).toEqual({ minutes: 0, credits: 0 });
    expect(await me()).toMatchObject({ minutes: 5, credits: 50 });
  });

  it("re-running a source paid for in the last 7 days is free", async () => {
    const first = await project();
    await am.chargeRunMinutes({ userId, projectId: first, uploadedVideoUrl: SRC, durationSec: 30 * 60 });
    const second = await project();
    const r = await am.chargeRunMinutes({ userId, projectId: second, uploadedVideoUrl: SRC, durationSec: 30 * 60 });
    expect(r).toMatchObject({ ok: true, minutes: 0, freeRerunOf: first });
    expect((await me()).minutes).toBe(70);
  });

  it("a REFUNDED (failed) run does not make the next run free", async () => {
    const first = await project();
    await am.chargeRunMinutes({ userId, projectId: first, uploadedVideoUrl: SRC, durationSec: 30 * 60 });
    await am.refundRunMinutes(userId, first, "refund:failed");
    const second = await project();
    const r = await am.chargeRunMinutes({ userId, projectId: second, uploadedVideoUrl: SRC, durationSec: 30 * 60 });
    expect(r).toMatchObject({ ok: true, minutes: 30 });
    expect(r).not.toHaveProperty("freeRerunOf");
  });

  it("treats a presigned URL and the bare URL of the same object as the same source", async () => {
    const first = await project(`${SRC}?X-Amz-Signature=aaa`);
    await am.chargeRunMinutes({ userId, projectId: first, uploadedVideoUrl: `${SRC}?X-Amz-Signature=aaa`, durationSec: 120 });
    const second = await project(SRC);
    const r = await am.chargeRunMinutes({ userId, projectId: second, uploadedVideoUrl: SRC, durationSec: 120 });
    expect(r).toMatchObject({ ok: true, minutes: 0, freeRerunOf: first });
    const third = await project(`${SRC}?X-Amz-Signature=bbb`);
    const r3 = await am.chargeRunMinutes({ userId, projectId: third, uploadedVideoUrl: `${SRC}?X-Amz-Signature=bbb`, durationSec: 120 });
    expect(r3).toMatchObject({ ok: true, minutes: 0 });
  });

  it("a different source is never a free re-run — including one whose path merely starts the same", async () => {
    const first = await project();
    await am.chargeRunMinutes({ userId, projectId: first, uploadedVideoUrl: SRC, durationSec: 60 });
    const longer = `${SRC}.bak`;
    const lp = await project(longer);
    expect(await am.chargeRunMinutes({ userId, projectId: lp, uploadedVideoUrl: longer, durationSec: 60 })).toMatchObject({ ok: true, minutes: 1 });
  });

  it("a different source is never a free re-run", async () => {
    const first = await project();
    await am.chargeRunMinutes({ userId, projectId: first, uploadedVideoUrl: SRC, durationSec: 60 });
    const other = SRC.replace("source.mp4", "another.mp4");
    const second = await project(other);
    const r = await am.chargeRunMinutes({ userId, projectId: second, uploadedVideoUrl: other, durationSec: 60 });
    expect(r).toMatchObject({ ok: true, minutes: 1 });
  });

  it("precheck: passes when affordable, refuses a shortfall, and honours the overflow opt-in", async () => {
    await balances(10, 3);
    const p = await project();
    const base = { userId, projectId: p, uploadedVideoUrl: SRC };
    expect(await am.precheckRunMinutes({ ...base, durationSec: 9 * 60 })).toEqual({ ok: true });
    expect(await am.precheckRunMinutes({ ...base, durationSec: 19 * 60 })).toEqual({
      ok: false, needed: 19, available: 10, overflowCredits: 3,
    });
    expect(await am.precheckRunMinutes({ ...base, durationSec: 19 * 60, allowCreditOverflow: true })).toEqual({ ok: true });
    // 13 short needs 5 credits; only 3 on hand.
    expect((await am.precheckRunMinutes({ ...base, durationSec: 23 * 60, allowCreditOverflow: true })).ok).toBe(false);
    // Pre-checks never charge.
    expect(await me()).toMatchObject({ minutes: 10, credits: 3 });
  });
});
