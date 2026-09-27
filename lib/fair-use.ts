// Daily fair-use caps for the tools that became free on 2026-09-26.
//
// These are single Gemini text calls that cost well under $0.001 each. Charging
// 1 credit (~$0.08) for them was ~80x cost and mostly felt petty, so they are
// free — but free and uncapped is an open tap on a paid API, so each gets a
// per-user daily allowance instead of a price.

import { rateLimit } from "@/lib/rate-limit";
import type { TierId } from "@/lib/plans/tiers";

export const FREE_TEXT_TOOLS = ["brainstormer", "editor-ai-text", "social-caption", "social-post-narration"] as const;
export type FreeTextTool = (typeof FREE_TEXT_TOOLS)[number];

/** Uses per rolling day. Free accounts get a taste; paid plans get headroom. */
export const FAIR_USE_PER_DAY: Record<"free" | "paid", number> = { free: 5, paid: 50 };

export function isFreeTextTool(slug: string): slug is FreeTextTool {
  return (FREE_TEXT_TOOLS as readonly string[]).includes(slug);
}

export type FairUseResult = { allowed: true } | { allowed: false; limit: number; message: string };

/**
 * Take one use of `tool` for today. Call it BEFORE the provider call; a refused
 * request has consumed nothing. The window is a rolling 24h per user per tool.
 */
export async function takeFairUse(userId: string, tool: FreeTextTool, tier: TierId): Promise<FairUseResult> {
  const limit = tier === "free" ? FAIR_USE_PER_DAY.free : FAIR_USE_PER_DAY.paid;
  const { allowed } = await rateLimit(`fair-use:${tool}:${userId}`, limit, 24 * 60 * 60);
  if (allowed) return { allowed: true };
  return {
    allowed: false,
    limit,
    message: tier === "free"
      ? `You've used today's ${limit} free uses of this tool. Upgrade for ${FAIR_USE_PER_DAY.paid} a day, or try again tomorrow.`
      : `You've used today's ${limit} uses of this tool. It resets in 24 hours.`,
  };
}
