import { Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { getToolConfig } from "@/lib/tool-config";
import { tierAtLeast, lowestTier, type TierId } from "@/lib/plans/tiers";

// Shared credit-charging service, generalizing the identical decrement/
// refund/Redis-cache pattern every tool route used to reimplement locally.
// Phase 1 (of the audit-fix rollout) migrates every credit-charging tool
// route onto this — see the Phase 1 plan for the full list.
//
// Transaction shape is preserved as-is from the routes it replaces: Redis
// fast-fail -> atomic Postgres {decrement} -> refund-if-negative. This is not
// a true serializable transaction, but the decrement itself is atomic at the
// DB level, and the only "gap" (a balance can be transiently negative before
// its own request's refund lands) is self-correcting and invisible past that
// one request — not hardened further here to avoid changing latency/lock
// behavior on hot paths for a property the current design already has.

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

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { credits: { decrement: params.amount } },
    select: { credits: true },
  });
  const balance = updated.credits;

  if (balance < 0) {
    await prisma.user.update({ where: { id: params.userId }, data: { credits: { increment: params.amount } } });
    return { ok: false, reason: "insufficient_credits", balance: balance + params.amount };
  }

  await redis.set(`credits:${params.userId}`, String(balance), "EX", 3600);

  let generationId: string | undefined;
  if (params.log || params.idempotencyKey) {
    try {
      const row = await prisma.generation.create({
        data: {
          userId: params.userId,
          toolSlug: params.toolSlug,
          modelId: params.log?.modelId ?? null,
          generationType: params.log?.generationType ?? "utility",
          creditsCost: params.amount,
          estimatedCostUsd: params.log?.estimatedCostUsd ?? null,
          prompt: params.log?.prompt ?? null,
          status: "pending",
          idempotencyKey: params.idempotencyKey ?? null,
        },
        select: { id: true },
      });
      generationId = row.id;
    } catch (e) {
      // A concurrent request carrying the same idempotencyKey won the race
      // and already inserted its Generation row — this call's decrement
      // above is a genuine double-charge unless reversed, so refund it and
      // adopt the winner's result instead of returning our own.
      if (params.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await prisma.user.update({ where: { id: params.userId }, data: { credits: { increment: params.amount } } });
        const winner = await prisma.generation.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
          select: { id: true },
        });
        const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { credits: true } });
        return { ok: true, balance: user?.credits ?? balance + params.amount, generationId: winner?.id };
      }
      // Otherwise best-effort — logging must never block a successful charge.
    }
  }

  return { ok: true, balance, generationId };
}

export interface RefundCreditsParams {
  userId: string;
  amount: number;
  generationId?: string;
}

export async function refundCredits(params: RefundCreditsParams): Promise<void> {
  await prisma.user.update({ where: { id: params.userId }, data: { credits: { increment: params.amount } } });
  const cached = await redis.get(`credits:${params.userId}`);
  if (cached !== null) {
    await redis.set(`credits:${params.userId}`, String(parseInt(cached, 10) + params.amount), "EX", 3600);
  }
  if (params.generationId) {
    try {
      await prisma.generation.update({
        where: { id: params.generationId },
        data: { status: "refunded" },
      });
    } catch {
      // Best-effort.
    }
  }
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return (user?.credits ?? 0) >= amount;
}

export interface ModelAccessCheck {
  allowed: boolean;
  requiredTier?: TierId; // present only when allowed === false
}

export async function checkModelAccess(
  userId: string,
  entry: { allowedTiers: readonly TierId[] },
): Promise<ModelAccessCheck> {
  const userTier = await getUserTier(userId);
  if (tierAtLeast(userTier, lowestTier(entry.allowedTiers))) return { allowed: true };
  return { allowed: false, requiredTier: lowestTier(entry.allowedTiers) };
}
