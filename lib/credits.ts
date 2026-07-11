import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { getToolConfig } from "@/lib/tool-config";
import { tierAtLeast, lowestTier, type TierId } from "@/lib/plans/tiers";

// Shared credit-charging service, generalizing the identical decrement/
// refund/Redis-cache pattern that ~20 tool routes each reimplement locally.
// Phase 1 migrates only image-generator, video-generator, and ai-creator onto
// this — the other ~17 routes are an explicit fast-follow once this service
// is proven in production (see the Phase 1 plan's §3 for the reasoning).
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
  if (params.log) {
    try {
      const row = await prisma.generation.create({
        data: {
          userId: params.userId,
          toolSlug: params.toolSlug,
          modelId: params.log.modelId ?? null,
          generationType: params.log.generationType,
          creditsCost: params.amount,
          estimatedCostUsd: params.log.estimatedCostUsd ?? null,
          prompt: params.log.prompt ?? null,
          status: "pending",
        },
        select: { id: true },
      });
      generationId = row.id;
    } catch {
      // Best-effort — logging must never block a successful charge.
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
  status: "completed" | "failed",
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
