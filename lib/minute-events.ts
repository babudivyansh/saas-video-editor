// Low Clip Minutes warning — the minutes twin of the low-credits email in
// lib/credit-events.ts (2026-09-26 pricing model).
//
// Fired after a successful minutes spend. Sends once per cycle when the balance
// drops to ~20% of the monthly minutes, never blocks or fails the spend.
//
// The once-per-cycle guard is a Redis key rather than a User column (the credit
// version uses lowCreditEmailSentAt): it expires on its own a little before
// the next monthly grant, so no refill path has to remember to reset it. If
// Redis is down the guard fails CLOSED — no email — because a missed warning
// is harmless and a repeated one is spam.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, isLowMinutes } from "@/lib/plans/tiers";

const GUARD_TTL_SEC = 25 * 24 * 60 * 60;

export function fireLowMinutesEmail(userId: string, newBalance: number): void {
  void (async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true, firstName: true, name: true, monthlyMinutes: true, subscriptionEndsAt: true,
          plan: { select: { tier: true, kind: true } },
        },
      });
      if (!user?.email) return;

      const active = user.plan?.kind === "subscription" && !!user.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
      const tier = (active ? (user.plan?.tier ?? "free") : "free") as "free" | "creator" | "pro" | "studio";
      const monthly = active ? user.monthlyMinutes : FREE_TIER_MONTHLY_BONUS_MINUTES;
      if (!isLowMinutes(newBalance, monthly)) return;

      // Atomic claim: only the first spend under the threshold this cycle sees 1.
      const claims = await redis.incrWithExpire(`low-minutes-email:${userId}`, GUARD_TTL_SEC).catch(() => 0);
      if (claims !== 1) return;

      const { sendLowMinutesEmail } = await import("@/lib/email");
      await sendLowMinutesEmail(user.email, user.firstName ?? user.name ?? "", newBalance, tier);
    } catch (e) {
      logger.error("minute-events", `low-minutes email failed for ${userId}`, e);
    }
  })();
}
