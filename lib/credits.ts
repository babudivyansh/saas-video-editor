import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getToolConfig } from "@/lib/tool-config";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { tierAtLeast, lowestTier, type TierId } from "@/lib/plans/tiers";

// Shared credit service. As of the 2026-07 bucket split, the balance lives in
// three buckets on User — bonusCredits, subscriptionCredits, purchasedCredits
// — drained in that order by spendCredits, with User.credits maintained as
// the denormalized total in the same atomic statement. Every mutation writes
// CreditTransaction ledger rows (bucket, delta, reason, refId), which is what
// lets refunds restore exactly the buckets a spend drained.
//
// This module is the ONLY place allowed to mutate credit columns —
// scripts/check-unverified-costs.mjs fails the build on raw
// credits:{increment|decrement} elsewhere.
//
// Concurrency: spends take a row lock via a single UPDATE...FROM (SELECT FOR
// UPDATE) statement, so two concurrent spends serialize and an insufficient
// balance simply matches zero rows — no transient-negative window. The Redis
// `credits:{userId}` key caches the TOTAL for fast-fail only.

export type CreditBucket = "bonus" | "subscription" | "purchased";

export interface CreditBalances {
  bonus: number;
  subscription: number;
  purchased: number;
  total: number;
}

type Tx = Prisma.TransactionClient;

async function refreshCreditCache(userId: string, total: number): Promise<void> {
  try {
    await redis.set(`credits:${userId}`, String(total), "EX", 3600);
  } catch {
    // Cache only — never let Redis failures break a balance mutation.
  }
}

export async function getBalances(userId: string, tx: Tx | typeof prisma = prisma): Promise<CreditBalances> {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { bonusCredits: true, subscriptionCredits: true, purchasedCredits: true },
  });
  const bonus = u?.bonusCredits ?? 0;
  const subscription = u?.subscriptionCredits ?? 0;
  const purchased = u?.purchasedCredits ?? 0;
  return { bonus, subscription, purchased, total: bonus + subscription + purchased };
}

const BUCKET_COLUMN: Record<CreditBucket, "bonusCredits" | "subscriptionCredits" | "purchasedCredits"> = {
  bonus: "bonusCredits",
  subscription: "subscriptionCredits",
  purchased: "purchasedCredits",
};

export interface GrantCreditsParams {
  userId: string;
  bucket: CreditBucket;
  amount: number; // > 0
  reason: string; // e.g. "grant:pack", "grant:refill", "grant:quest"
  refId?: string; // e.g. Razorpay payment id
  /** Only meaningful for bucket "bonus": refreshes the user's bonus expiry. */
  bonusExpiresAt?: Date;
  tx?: Tx;
}

/** Grant credits into a bucket (+ ledger row + total upkeep). Composable into
 * a caller's transaction via `tx`; cache refresh happens only when not inside
 * a caller transaction (callers passing tx refresh after commit). */
export async function grantCredits(params: GrantCreditsParams): Promise<CreditBalances> {
  const { userId, bucket, amount, reason, refId, bonusExpiresAt } = params;
  if (amount <= 0) return getBalances(userId, params.tx ?? prisma);

  const run = async (tx: Tx): Promise<CreditBalances> => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        [BUCKET_COLUMN[bucket]]: { increment: amount },
        credits: { increment: amount },
        ...(bucket === "bonus" && bonusExpiresAt ? { bonusCreditsExpireAt: bonusExpiresAt } : {}),
      },
      select: { bonusCredits: true, subscriptionCredits: true, purchasedCredits: true },
    });
    await tx.creditTransaction.create({
      data: { userId, bucket, delta: amount, reason, refId: refId ?? null },
    });
    return {
      bonus: updated.bonusCredits,
      subscription: updated.subscriptionCredits,
      purchased: updated.purchasedCredits,
      total: updated.bonusCredits + updated.subscriptionCredits + updated.purchasedCredits,
    };
  };

  if (params.tx) return run(params.tx);
  const balances = await prisma.$transaction(run);
  await refreshCreditCache(userId, balances.total);
  return balances;
}

export interface SpendCreditsParams {
  userId: string;
  amount: number; // > 0
  reason: string; // e.g. "spend:image-generator"
  refId?: string; // usually the Generation id
}

export type SpendCreditsResult =
  | { ok: true; balances: CreditBalances; breakdown: Partial<Record<CreditBucket, number>> }
  | { ok: false; reason: "insufficient_credits"; balances: CreditBalances };

interface SpendRow {
  ob: number; os: number; op: number; // balances before
  nb: number; ns: number; np: number; // balances after
}

/** Atomically drain `amount` across buckets (bonus -> subscription ->
 * purchased). Fails without side effects when the total is insufficient. */
export async function spendCredits(params: SpendCreditsParams): Promise<SpendCreditsResult> {
  const { userId, amount, reason, refId } = params;

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<SpendRow[]>`
      WITH cur AS (
        SELECT "bonusCredits" AS b, "subscriptionCredits" AS s, "purchasedCredits" AS p
        FROM "User" WHERE id = ${userId} FOR UPDATE
      )
      UPDATE "User" u SET
        "bonusCredits"        = cur.b - LEAST(cur.b, ${amount}),
        "subscriptionCredits" = cur.s - LEAST(cur.s, GREATEST(${amount} - cur.b, 0)),
        "purchasedCredits"    = cur.p - GREATEST(${amount} - cur.b - cur.s, 0),
        "credits"             = cur.b + cur.s + cur.p - ${amount}
      FROM cur
      WHERE u.id = ${userId} AND cur.b + cur.s + cur.p >= ${amount}
      RETURNING cur.b AS ob, cur.s AS os, cur.p AS op,
                u."bonusCredits" AS nb, u."subscriptionCredits" AS ns, u."purchasedCredits" AS np
    `;
    if (rows.length === 0) return null;

    const r = rows[0];
    const breakdown: Partial<Record<CreditBucket, number>> = {};
    if (r.ob - r.nb > 0) breakdown.bonus = r.ob - r.nb;
    if (r.os - r.ns > 0) breakdown.subscription = r.os - r.ns;
    if (r.op - r.np > 0) breakdown.purchased = r.op - r.np;

    for (const [bucket, drained] of Object.entries(breakdown)) {
      await tx.creditTransaction.create({
        data: { userId, bucket, delta: -drained, reason, refId: refId ?? null },
      });
    }
    return {
      balances: { bonus: r.nb, subscription: r.ns, purchased: r.np, total: r.nb + r.ns + r.np },
      breakdown,
    };
  });

  if (!outcome) {
    const balances = await getBalances(userId);
    return { ok: false, reason: "insufficient_credits", balances };
  }
  await refreshCreditCache(userId, outcome.balances.total);

  // Fire-and-forget: never let the auto-topup check add latency or failure
  // risk to the hot spend path.
  void maybeAutoTopup(userId, outcome.balances.total).catch(() => {});

  return { ok: true, ...outcome };
}

const AUTO_TOPUP_THRESHOLD = 10;
const AUTO_TOPUP_LOCK_TTL_SEC = 3600; // one prompt per hour per user, max

/** Post-spend low-balance hook for opt-in auto top-up. In India, an instant
 * background charge on a saved method mostly can't complete without a
 * pre-registered mandate (RBI e-mandate rules), so this sends a one-click
 * top-up email rather than attempting a silent charge — see
 * lib/email.ts's sendAutoTopupPromptEmail for the full rationale. */
async function maybeAutoTopup(userId: string, total: number): Promise<void> {
  if (total >= AUTO_TOPUP_THRESHOLD) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoTopupPackSlug: true, email: true, firstName: true, name: true },
  });
  if (!user?.autoTopupPackSlug) return;

  const lockKey = `auto-topup-lock:${userId}`;
  const locked = await redis.get(lockKey);
  if (locked) return;
  await redis.set(lockKey, "1", "EX", AUTO_TOPUP_LOCK_TTL_SEC);

  const pack = await prisma.plan.findUnique({ where: { slug: user.autoTopupPackSlug } });
  if (!pack || !pack.active || pack.kind !== "pack") return;

  const { sendAutoTopupPromptEmail } = await import("@/lib/email");
  const checkoutUrl = `https://clipiro.com/billing?autotopup=${encodeURIComponent(pack.slug)}`;
  await sendAutoTopupPromptEmail(user.email, user.firstName ?? user.name ?? "", total, pack.name, checkoutUrl);
}

/** Restore up to `amount` credits of the spend identified by `refId`, into
 * exactly the buckets it drained (minus anything already refunded). Used for
 * both full refunds and partial ones (e.g. proportional auto-clip refunds).
 * Returns the amount actually restored. */
export async function restoreSpend(params: {
  userId: string;
  refId: string;
  amount?: number; // omit = refund the full remaining spend
  reason?: string;
}): Promise<number> {
  const { userId, refId } = params;
  const reason = params.reason ?? "refund";

  const restoredTotal = await prisma.$transaction(async (tx) => {
    const rows = await tx.creditTransaction.findMany({
      where: { userId, refId },
      select: { bucket: true, delta: true, reason: true },
    });
    // Net spent per bucket = -(sum of all deltas for this refId): spends are
    // negative, previous refunds positive, so the net is what's refundable.
    const refundable: Record<CreditBucket, number> = { bonus: 0, subscription: 0, purchased: 0 };
    for (const row of rows) refundable[row.bucket as CreditBucket] -= row.delta;

    let remaining = params.amount ?? Number.MAX_SAFE_INTEGER;
    let restored = 0;
    // Restore cheapest-to-expire last: purchased first, bonus last, so a
    // partial refund biases the user's balance toward credits that keep.
    for (const bucket of ["purchased", "subscription", "bonus"] as const) {
      const give = Math.min(Math.max(refundable[bucket], 0), remaining);
      if (give <= 0) continue;
      await tx.user.update({
        where: { id: userId },
        data: { [BUCKET_COLUMN[bucket]]: { increment: give }, credits: { increment: give } },
      });
      await tx.creditTransaction.create({
        data: { userId, bucket, delta: give, reason, refId },
      });
      remaining -= give;
      restored += give;
    }
    return restored;
  });

  if (restoredTotal > 0) {
    const balances = await getBalances(userId);
    await refreshCreditCache(userId, balances.total);
  }
  return restoredTotal;
}

/** Drain up to `amount` (never failing) — for refund clawbacks where the money
 * left but the user may have already spent some of the granted credits.
 * Purchased is clawed first since that's the bucket purchases grant into. */
export async function clawbackCredits(params: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
  tx?: Tx;
}): Promise<number> {
  const { userId, amount, reason, refId } = params;
  const run = async (tx: Tx) => {
    const bal = await getBalances(userId, tx);
    let remaining = Math.max(amount, 0);
    let total = 0;
    for (const bucket of ["purchased", "subscription", "bonus"] as const) {
      const take = Math.min(bal[bucket], remaining);
      if (take <= 0) continue;
      await tx.user.update({
        where: { id: userId },
        data: { [BUCKET_COLUMN[bucket]]: { decrement: take }, credits: { decrement: take } },
      });
      await tx.creditTransaction.create({
        data: { userId, bucket, delta: -take, reason, refId: refId ?? null },
      });
      remaining -= take;
      total += take;
    }
    return total;
  };
  const clawed = params.tx ? await run(params.tx) : await prisma.$transaction(run);
  if (!params.tx) {
    const balances = await getBalances(userId);
    await refreshCreditCache(userId, balances.total);
  }
  return clawed;
}

/** Zero a user's expired bonus bucket (cron step). Returns credits expired. */
export async function expireBonusCredits(userId: string): Promise<number> {
  const expiredAmount = await prisma.$transaction(async (tx) => {
    const bal = await getBalances(userId, tx);
    if (bal.bonus <= 0) return 0;
    await tx.user.update({
      where: { id: userId },
      data: { bonusCredits: 0, credits: { decrement: bal.bonus }, bonusCreditsExpireAt: null },
    });
    await tx.creditTransaction.create({
      data: { userId, bucket: "bonus", delta: -bal.bonus, reason: "expire:bonus" },
    });
    return bal.bonus;
  });
  if (expiredAmount > 0) {
    const balances = await getBalances(userId);
    await refreshCreditCache(userId, balances.total);
  }
  return expiredAmount;
}

/** Hard-set the subscription bucket (rollover cap / lapse zeroing). */
export async function setSubscriptionCredits(
  userId: string,
  value: number,
  reason: string,
  tx?: Tx,
): Promise<void> {
  const run = async (t: Tx) => {
    const cur = await getBalances(userId, t);
    const delta = value - cur.subscription;
    if (delta === 0) return cur.total;
    await t.user.update({
      where: { id: userId },
      data: { subscriptionCredits: value, credits: { increment: delta } },
    });
    await t.creditTransaction.create({
      data: { userId, bucket: "subscription", delta, reason },
    });
    return cur.total + delta;
  };
  if (tx) { await run(tx); return; }
  const total = await prisma.$transaction(run);
  await refreshCreditCache(userId, total);
}

export interface ChargeCreditsParams {
  userId: string;
  amount: number;
  toolSlug: string;
  /**
   * Client-supplied key (e.g. one UUID generated once per submit click),
   * used to make a charge idempotent: a retried/duplicated request with the
   * same key returns the original result instead of charging again. The
   * `Generation.idempotencyKey` unique constraint is what actually makes
   * this race-safe between two concurrent requests with the same key — the
   * upfront lookup below is just the fast path for the common case.
   */
  idempotencyKey?: string;
  log?: {
    modelId?: string;
    generationType: "image" | "video" | "audio" | "utility";
    prompt?: string;
    estimatedCostUsd?: number;
  };
}

export type ChargeCreditsResult =
  | { ok: true; balance: number; generationId?: string }
  | { ok: false; reason: "insufficient_credits"; balance: number }
  | { ok: false; reason: "tool_disabled" };

export async function chargeCredits(params: ChargeCreditsParams): Promise<ChargeCreditsResult> {
  const toolCfg = await getToolConfig(params.toolSlug);
  if (!toolCfg.enabled) return { ok: false, reason: "tool_disabled" };

  if (params.idempotencyKey) {
    const existing = await prisma.generation.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      select: { id: true, userId: true },
    });
    if (existing) {
      const user = await prisma.user.findUnique({ where: { id: existing.userId }, select: { credits: true } });
      return { ok: true, balance: user?.credits ?? 0, generationId: existing.id };
    }
  }

  const cachedCredits = await redis.get(`credits:${params.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < params.amount) {
    return { ok: false, reason: "insufficient_credits", balance: cached };
  }

  // The Generation id doubles as the ledger refId, so it's minted upfront and
  // passed to the bucket-aware spend before the row itself exists.
  const generationId = randomUUID();
  const spend = await spendCredits({
    userId: params.userId,
    amount: params.amount,
    reason: `spend:${params.toolSlug}`,
    refId: generationId,
  });
  if (!spend.ok) {
    return { ok: false, reason: "insufficient_credits", balance: spend.balances.total };
  }
  const balance = spend.balances.total;

  let loggedGenerationId: string | undefined;
  if (params.log || params.idempotencyKey) {
    try {
      const row = await prisma.generation.create({
        data: {
          id: generationId,
          userId: params.userId,
          toolSlug: params.toolSlug,
          modelId: params.log?.modelId ?? null,
          generationType: params.log?.generationType ?? "utility",
          creditsCost: params.amount,
          // Cost analytics fallback: routes that don't compute a per-call cost
          // (registry-less tools) inherit the researched per-generation figure
          // from TOOL_COSTS, so AI spend dashboards cover every tool instead
          // of only the three that pass an explicit value.
          estimatedCostUsd: params.log?.estimatedCostUsd ?? TOOL_COSTS[params.toolSlug]?.costUsd ?? null,
          prompt: params.log?.prompt ?? null,
          status: "pending",
          idempotencyKey: params.idempotencyKey ?? null,
        },
        select: { id: true },
      });
      loggedGenerationId = row.id;
    } catch (e) {
      // A concurrent request carrying the same idempotencyKey won the race
      // and already inserted its Generation row — this call's spend above is
      // a genuine double-charge unless reversed, so restore it (into exactly
      // the buckets it drained) and adopt the winner's result.
      if (params.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await restoreSpend({ userId: params.userId, refId: generationId, reason: "refund:idempotency-race" });
        const winner = await prisma.generation.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
          select: { id: true },
        });
        const balances = await getBalances(params.userId);
        return { ok: true, balance: balances.total, generationId: winner?.id };
      }
      // Otherwise best-effort — logging must never block a successful charge.
    }
  }

  return { ok: true, balance, generationId: loggedGenerationId };
}

export interface RefundCreditsParams {
  userId: string;
  amount: number;
  generationId?: string;
}

export async function refundCredits(params: RefundCreditsParams): Promise<void> {
  if (params.generationId) {
    // Ledger-driven: restore up to `amount` into exactly the buckets the
    // original spend drained (supports partial refunds).
    const restored = await restoreSpend({
      userId: params.userId,
      refId: params.generationId,
      amount: params.amount,
    });
    // Legacy safety net: a generation charged before the bucket split has no
    // ledger rows — fall back to granting the purchased bucket.
    if (restored < params.amount) {
      await grantCredits({
        userId: params.userId,
        bucket: "purchased",
        amount: params.amount - restored,
        reason: "refund:legacy",
        refId: params.generationId,
      });
    }
    try {
      await prisma.generation.update({
        where: { id: params.generationId },
        data: { status: "refunded" },
      });
    } catch {
      // Best-effort.
    }
    return;
  }
  // No spend reference — credit the never-expiring bucket.
  await grantCredits({
    userId: params.userId,
    bucket: "purchased",
    amount: params.amount,
    reason: "refund",
  });
}

export async function markGenerationStatus(
  generationId: string,
  status: "completed" | "failed" | "cancelled",
  errorMessage?: string,
): Promise<void> {
  try {
    await prisma.generation.update({
      where: { id: generationId },
      data: { status, errorMessage: errorMessage ?? null, completedAt: new Date() },
    });
  } catch {
    // Best-effort — this is derived data, not the source of truth for balance.
  }
}

/** Write-through job progress (0-100) onto the Generation row, so a job's
 * progress survives a server restart and is visible to anything reading the
 * ledger — not just the in-memory Map the route itself polls against. */
export async function updateGenerationProgress(generationId: string, progress: number): Promise<void> {
  try {
    await prisma.generation.update({
      where: { id: generationId },
      data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
    });
  } catch {
    // Best-effort — progress is informational, not the source of truth for billing.
  }
}

/** Marks a generation as cancel-requested. Routes check
 * `isGenerationCancelled` between their own processing stages and stop +
 * refund if it's true — this does not itself kill an in-flight external
 * API call, it's a cooperative checkpoint. */
export async function cancelGeneration(generationId: string): Promise<void> {
  await prisma.generation.update({
    where: { id: generationId },
    data: { cancelledAt: new Date() },
  });
}

export async function isGenerationCancelled(generationId: string): Promise<boolean> {
  const row = await prisma.generation.findUnique({ where: { id: generationId }, select: { cancelledAt: true } });
  return row?.cancelledAt != null;
}

export async function hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
  const cached = await redis.get(`credits:${userId}`);
  if (cached !== null) return parseInt(cached, 10) >= amount;
  return (await getBalances(userId)).total >= amount;
}

export interface ModelAccessCheck {
  allowed: boolean;
  requiredTier?: TierId; // present only when allowed === false
}

export async function checkModelAccess(
  userId: string,
  entry: { allowedTiers: readonly TierId[] },
): Promise<ModelAccessCheck> {
  // Lazy import: lib/auth pulls in lib/env (strict validation) and more —
  // keeping it out of this module's static graph lets billing/credit code be
  // unit-tested with only prisma/redis mocked.
  const { getUserTier } = await import("@/lib/auth");
  const userTier = await getUserTier(userId);
  if (tierAtLeast(userTier, lowestTier(entry.allowedTiers))) return { allowed: true };
  return { allowed: false, requiredTier: lowestTier(entry.allowedTiers) };
}
