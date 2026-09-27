import { Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER } from "@/lib/plans/tiers";

// Clip Minutes — the second meter (2026-09-26 pricing plan). AutoClip bills
// in minutes of uploaded source video; AI Credits (lib/credits.ts) pay for the
// generative extras.
//
// Deliberately a mirror of lib/credits.ts rather than a `meter` column on the
// shared ledger: CreditTransaction is read by refunds (keyed on refId), admin
// ledgers and the credit-economy analytics, and every one of those would have
// needed a new filter to avoid mixing units. A separate table makes that
// impossible by construction — a minute can never be refunded as a credit.
//
// Same guarantees as credits:
//   - three buckets, drained bonus -> subscription -> purchased, with
//     User.minutes kept as the denormalized total in the same statement;
//   - every mutation writes MinuteTransaction rows (bucket, delta, reason,
//     refId), which is what lets restoreMinutes put back exactly what a spend
//     took;
//   - spends take the user row lock, so concurrent spends serialize and an
//     insufficient balance matches zero rows.
//
// This module is the ONLY place allowed to mutate minute columns —
// scripts/check-unverified-costs.mjs fails the build on raw mutations elsewhere.

export type MinuteBucket = "bonus" | "subscription" | "purchased";

export interface MinuteBalances {
  bonus: number;
  subscription: number;
  purchased: number;
  total: number;
}

type Tx = Prisma.TransactionClient;

const BUCKET_COLUMN: Record<MinuteBucket, "bonusMinutes" | "subscriptionMinutes" | "purchasedMinutes"> = {
  bonus: "bonusMinutes",
  subscription: "subscriptionMinutes",
  purchased: "purchasedMinutes",
};

async function refreshMinuteCache(userId: string, total: number): Promise<void> {
  try {
    await redis.set(`minutes:${userId}`, String(total), "EX", 3600);
  } catch {
    // Cache only — never let Redis failures break a balance mutation.
  }
}

async function lockUserRow(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function getMinuteBalances(userId: string, tx: Tx | typeof prisma = prisma): Promise<MinuteBalances> {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { bonusMinutes: true, subscriptionMinutes: true, purchasedMinutes: true },
  });
  const bonus = u?.bonusMinutes ?? 0;
  const subscription = u?.subscriptionMinutes ?? 0;
  const purchased = u?.purchasedMinutes ?? 0;
  return { bonus, subscription, purchased, total: bonus + subscription + purchased };
}

/** Whole minutes a source of `durationSec` bills: rounded UP, never below 1. */
export function billableSourceMinutes(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / 60));
}

export interface GrantMinutesParams {
  userId: string;
  bucket: MinuteBucket;
  amount: number; // > 0
  reason: string; // "grant:subscription" | "grant:refill" | "grant:minute-pack" | ...
  refId?: string;
  /** Only meaningful for bucket "bonus": refreshes the bonus expiry. */
  bonusExpiresAt?: Date;
  tx?: Tx;
}

export async function grantMinutes(params: GrantMinutesParams): Promise<MinuteBalances> {
  const { userId, bucket, amount, reason, refId, bonusExpiresAt } = params;
  if (amount <= 0) return getMinuteBalances(userId, params.tx ?? prisma);

  const run = async (tx: Tx): Promise<MinuteBalances> => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        [BUCKET_COLUMN[bucket]]: { increment: amount },
        minutes: { increment: amount },
        ...(bucket === "bonus" && bonusExpiresAt ? { bonusMinutesExpireAt: bonusExpiresAt } : {}),
      },
      select: { bonusMinutes: true, subscriptionMinutes: true, purchasedMinutes: true },
    });
    await tx.minuteTransaction.create({ data: { userId, bucket, delta: amount, reason, refId: refId ?? null } });
    return {
      bonus: updated.bonusMinutes,
      subscription: updated.subscriptionMinutes,
      purchased: updated.purchasedMinutes,
      total: updated.bonusMinutes + updated.subscriptionMinutes + updated.purchasedMinutes,
    };
  };

  if (params.tx) return run(params.tx);
  const balances = await prisma.$transaction(run);
  await refreshMinuteCache(userId, balances.total);
  return balances;
}

/**
 * The monthly subscription grant with the rollover cap: the subscription bucket
 * becomes min(current + grant, cap x grant). Returns the minutes actually
 * applied (0 when already at the cap). Shared by fulfilment and the refill cron
 * so the cap can't drift between them — the credit version is written out
 * twice, in lib/fulfillment.ts and the cron.
 */
export async function grantMonthlyMinutes(params: {
  userId: string;
  monthlyMinutes: number;
  reason: string;
  refId?: string;
  tx?: Tx;
}): Promise<number> {
  const { userId, monthlyMinutes, reason, refId } = params;
  if (monthlyMinutes <= 0) return 0;
  const run = async (tx: Tx): Promise<number> => {
    await lockUserRow(tx, userId);
    const bal = await getMinuteBalances(userId, tx);
    const cap = monthlyMinutes * SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER;
    const applied = Math.max(Math.min(bal.subscription + monthlyMinutes, cap) - bal.subscription, 0);
    if (applied > 0) await grantMinutes({ userId, bucket: "subscription", amount: applied, reason, refId, tx });
    return applied;
  };
  if (params.tx) return run(params.tx);
  const applied = await prisma.$transaction(run);
  if (applied > 0) await refreshMinuteCache(userId, (await getMinuteBalances(userId)).total);
  return applied;
}

export interface SpendMinutesParams {
  userId: string;
  amount: number; // > 0
  reason: string; // "spend:auto-clip" | ...
  refId?: string;
}

export type SpendMinutesResult =
  | { ok: true; balances: MinuteBalances; breakdown: Partial<Record<MinuteBucket, number>> }
  | { ok: false; reason: "insufficient_minutes"; balances: MinuteBalances };

interface SpendRow { ob: number; os: number; op: number; nb: number; ns: number; np: number }

/** Atomically drain `amount` across buckets (bonus -> subscription ->
 *  purchased). Fails without side effects when the total is insufficient. */
export async function spendMinutes(params: SpendMinutesParams): Promise<SpendMinutesResult> {
  const { userId, amount, reason, refId } = params;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`spendMinutes: amount must be a positive integer, got ${amount}`);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<SpendRow[]>`
      WITH cur AS (
        SELECT "bonusMinutes" AS b, "subscriptionMinutes" AS s, "purchasedMinutes" AS p
        FROM "User" WHERE id = ${userId} FOR UPDATE
      )
      UPDATE "User" u SET
        "bonusMinutes"        = cur.b - LEAST(cur.b, ${amount}),
        "subscriptionMinutes" = cur.s - LEAST(cur.s, GREATEST(${amount} - cur.b, 0)),
        "purchasedMinutes"    = cur.p - GREATEST(${amount} - cur.b - cur.s, 0),
        "minutes"             = cur.b + cur.s + cur.p - ${amount}
      FROM cur
      WHERE u.id = ${userId} AND cur.b + cur.s + cur.p >= ${amount}
      RETURNING cur.b AS ob, cur.s AS os, cur.p AS op,
                u."bonusMinutes" AS nb, u."subscriptionMinutes" AS ns, u."purchasedMinutes" AS np
    `;
    if (rows.length === 0) return null;

    const r = rows[0];
    const breakdown: Partial<Record<MinuteBucket, number>> = {};
    if (r.ob - r.nb > 0) breakdown.bonus = r.ob - r.nb;
    if (r.os - r.ns > 0) breakdown.subscription = r.os - r.ns;
    if (r.op - r.np > 0) breakdown.purchased = r.op - r.np;
    for (const [bucket, drained] of Object.entries(breakdown)) {
      await tx.minuteTransaction.create({ data: { userId, bucket, delta: -drained, reason, refId: refId ?? null } });
    }
    return { balances: { bonus: r.nb, subscription: r.ns, purchased: r.np, total: r.nb + r.ns + r.np }, breakdown };
  });

  if (!outcome) return { ok: false, reason: "insufficient_minutes", balances: await getMinuteBalances(userId) };
  await refreshMinuteCache(userId, outcome.balances.total);
  return { ok: true, ...outcome };
}

/** Restore up to `amount` minutes of the spend identified by `refId`, into
 *  exactly the buckets it drained (minus anything already refunded). Omit
 *  `amount` to refund everything still held. Returns the minutes restored. */
export async function restoreMinutes(params: {
  userId: string;
  refId: string;
  amount?: number;
  reason?: string;
}): Promise<number> {
  const { userId, refId } = params;
  const reason = params.reason ?? "refund";

  const restoredTotal = await prisma.$transaction(async (tx) => {
    // Same double-refund guard as restoreSpend: serialise before reading the ledger.
    await lockUserRow(tx, userId);
    const rows = await tx.minuteTransaction.findMany({ where: { userId, refId }, select: { bucket: true, delta: true } });
    const refundable: Record<MinuteBucket, number> = { bonus: 0, subscription: 0, purchased: 0 };
    for (const row of rows) refundable[row.bucket as MinuteBucket] -= row.delta;

    let remaining = params.amount ?? Number.MAX_SAFE_INTEGER;
    let restored = 0;
    // Longest-lived first, so a partial refund biases toward minutes that keep.
    for (const bucket of ["purchased", "subscription", "bonus"] as const) {
      const give = Math.min(Math.max(refundable[bucket], 0), remaining);
      if (give <= 0) continue;
      await tx.user.update({
        where: { id: userId },
        data: { [BUCKET_COLUMN[bucket]]: { increment: give }, minutes: { increment: give } },
      });
      await tx.minuteTransaction.create({ data: { userId, bucket, delta: give, reason, refId } });
      remaining -= give;
      restored += give;
    }
    return restored;
  });

  if (restoredTotal > 0) await refreshMinuteCache(userId, (await getMinuteBalances(userId)).total);
  return restoredTotal;
}

/** Drain up to `amount` (never failing) — refund clawbacks where the user may
 *  have already used some of the granted minutes. Purchased first. */
export async function clawbackMinutes(params: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
  tx?: Tx;
}): Promise<number> {
  const { userId, amount, reason, refId } = params;
  const run = async (tx: Tx) => {
    await lockUserRow(tx, userId);
    const bal = await getMinuteBalances(userId, tx);
    let remaining = Math.max(amount, 0);
    let total = 0;
    for (const bucket of ["purchased", "subscription", "bonus"] as const) {
      const take = Math.min(bal[bucket], remaining);
      if (take <= 0) continue;
      await tx.user.update({
        where: { id: userId },
        data: { [BUCKET_COLUMN[bucket]]: { decrement: take }, minutes: { decrement: take } },
      });
      await tx.minuteTransaction.create({ data: { userId, bucket, delta: -take, reason, refId: refId ?? null } });
      remaining -= take;
      total += take;
    }
    return total;
  };
  const clawed = params.tx ? await run(params.tx) : await prisma.$transaction(run);
  if (!params.tx) await refreshMinuteCache(userId, (await getMinuteBalances(userId)).total);
  return clawed;
}

/** Zero a user's expired bonus-minute bucket (cron step). */
export async function expireBonusMinutes(userId: string): Promise<number> {
  const expired = await prisma.$transaction(async (tx) => {
    await lockUserRow(tx, userId);
    const bal = await getMinuteBalances(userId, tx);
    if (bal.bonus <= 0) return 0;
    await tx.user.update({
      where: { id: userId },
      data: { bonusMinutes: 0, minutes: { decrement: bal.bonus }, bonusMinutesExpireAt: null },
    });
    await tx.minuteTransaction.create({ data: { userId, bucket: "bonus", delta: -bal.bonus, reason: "expire:bonus" } });
    return bal.bonus;
  });
  if (expired > 0) await refreshMinuteCache(userId, (await getMinuteBalances(userId)).total);
  return expired;
}

/** Hard-set the subscription bucket (lapse zeroing). */
export async function setSubscriptionMinutes(userId: string, value: number, reason: string, tx?: Tx): Promise<void> {
  const run = async (t: Tx) => {
    await lockUserRow(t, userId);
    const cur = await getMinuteBalances(userId, t);
    const delta = value - cur.subscription;
    if (delta === 0) return cur.total;
    await t.user.update({ where: { id: userId }, data: { subscriptionMinutes: value, minutes: { increment: delta } } });
    await t.minuteTransaction.create({ data: { userId, bucket: "subscription", delta, reason } });
    return cur.total + delta;
  };
  if (tx) { await run(tx); return; }
  await refreshMinuteCache(userId, await prisma.$transaction(run));
}
