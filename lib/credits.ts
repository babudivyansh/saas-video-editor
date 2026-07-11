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

export type CreditPool = "standard" | "veo3";

export interface ChargeCreditsParams {
  userId: string;
  amount: number;
  pool?: CreditPool;
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

async function decrementPool(userId: string, pool: CreditPool, amount: number): Promise<number> {
  if (pool === "veo3") {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { veo3Credits: { decrement: amount } },
      select: { veo3Credits: true },
    });
    return updated.veo3Credits;
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: amount } },
    select: { credits: true },
  });
  return updated.credits;
}

async function incrementPool(userId: string, pool: CreditPool, amount: number): Promise<void> {
  if (pool === "veo3") {
    await prisma.user.update({ where: { id: userId }, data: { veo3Credits: { increment: amount } } });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  }
}

export async function chargeCredits(params: ChargeCreditsParams): Promise<ChargeCreditsResult> {
  const pool = params.pool ?? "standard";

  const toolCfg = await getToolConfig(params.toolSlug);
  if (!toolCfg.enabled) return { ok: false, reason: "tool_disabled" };

  if (pool === "standard") {
    const cachedCredits = await redis.get(`credits:${params.userId}`);
    const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
    if (cached !== null && cached < params.amount) {
      return { ok: false, reason: "insufficient_credits", balance: cached };
    }
  }

  const balance = await decrementPool(params.userId, pool, params.amount);

  if (balance < 0) {
    await incrementPool(params.userId, pool, params.amount);
    return { ok: false, reason: "insufficient_credits", balance: balance + params.amount };
  }

  if (pool === "standard") {
    await redis.set(`credits:${params.userId}`, String(balance), "EX", 3600);
  }

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
          creditPool: pool,
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
  pool?: CreditPool;
  generationId?: string;
}

export async function refundCredits(params: RefundCreditsParams): Promise<void> {
  const pool = params.pool ?? "standard";

  await incrementPool(params.userId, pool, params.amount);
  if (pool === "standard") {
    const cached = await redis.get(`credits:${params.userId}`);
    if (cached !== null) {
      await redis.set(`credits:${params.userId}`, String(parseInt(cached, 10) + params.amount), "EX", 3600);
    }
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

export async function hasEnoughCredits(userId: string, amount: number, pool: CreditPool = "standard"): Promise<boolean> {
  if (pool !== "standard") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { veo3Credits: true } });
    return (user?.veo3Credits ?? 0) >= amount;
  }
  const cached = await redis.get(`credits:${userId}`);
  if (cached !== null) return parseInt(cached, 10) >= amount;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return (user?.credits ?? 0) >= amount;
}

// Generalizes Veo3's veo3Enabled/veo3Credits special access into a named,
// reusable mechanism instead of an isVeo3 branch: a model is accessible to a
// user EITHER because their plan tier is in allowedTiers, OR — if the model
// declares an overridePool — because they hold that pool's unlock, regardless
// of tier. Only "veo3" exists as an override pool today.
export interface ModelAccessCheck {
  allowed: boolean;
  requiredTier?: TierId; // present only when allowed === false
}

export async function checkModelAccess(
  userId: string,
  entry: { allowedTiers: readonly TierId[]; overridePool?: "veo3" },
): Promise<ModelAccessCheck> {
  const userTier = await getUserTier(userId);
  if (tierAtLeast(userTier, lowestTier(entry.allowedTiers))) return { allowed: true };

  if (entry.overridePool === "veo3") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { veo3Enabled: true, veo3Credits: true },
    });
    if (user?.veo3Enabled || (user?.veo3Credits ?? 0) > 0) return { allowed: true };
  }

  return { allowed: false, requiredTier: lowestTier(entry.allowedTiers) };
}
