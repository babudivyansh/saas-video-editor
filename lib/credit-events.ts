/**
 * lib/credit-events.ts
 *
 * Handles email side-effects after a user spends credits:
 *   1. Low-credits warning (20% threshold, once per billing cycle)
 *   2. Zero-credits alert (fires when render fails due to no credits)
 *
 * (The first-video upsell moved to app/api/cron/onboarding — see below.)
 *
 * All operations are fire-and-forget (non-fatal) — never let email logic
 * block or break the primary user action.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendLowCreditsEmail, sendZeroCreditsEmail } from "@/lib/email";
import { shouldSendCategory } from "@/lib/notifications";
import { greetingName } from "@/lib/display-name";

/**
 * Call this after a successful credit-spending action (render, voiceover, etc.)
 * Handles the low-credits email in a non-blocking way.
 *
 * @param userId   The user who just spent credits
 * @param newBalance  The user's credit balance AFTER the spend
 */
export function firePostCreditSpendEmails(userId: string, newBalance: number): void {
  // Fire-and-forget — intentionally not awaited
  ;(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          monthlyCredits: true,
          lowCreditEmailSentAt: true,
        },
      });
      if (!user) return;

      const displayName = greetingName(user.name);
      const now = new Date();

      // The first-video upsell used to fire here, on the first CREDIT spend.
      // AutoClip spends Clip Minutes, not credits, so most users who got
      // clips never received it (5 of 20 in Oct–Nov 2026). It now goes from
      // the onboarding cron after a first completed AutoClip run.

      // ── Low-credits warning (≤20% of monthly allocation) ────────────
      // Only send if user is a subscriber (monthlyCredits > 0) and
      // we haven't already sent it this billing cycle.
      const monthlyAllocation = user.monthlyCredits ?? 0;
      if (monthlyAllocation > 0) {
        const threshold20pct = Math.ceil(monthlyAllocation * 0.2);
        const alreadySent = !!user.lowCreditEmailSentAt;

        if (!alreadySent && newBalance <= threshold20pct && newBalance > 0) {
          const estimatedVideos = Math.floor(newBalance / 2); // assume avg 2 credits/video
          await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: now } });
          if (await shouldSendCategory(userId, "usageAlerts")) {
            sendLowCreditsEmail(user.email, displayName, newBalance, estimatedVideos)
              .catch((e) => logger.error("credit-events", "low-credits email error", e));
          }
        }
      } else {
        // Free user: warn at ≤2 credits remaining (out of 10 default)
        if (newBalance <= 2 && newBalance > 0 && !user.lowCreditEmailSentAt) {
          const estimatedVideos = newBalance;
          await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: now } });
          if (await shouldSendCategory(userId, "usageAlerts")) {
            sendLowCreditsEmail(user.email, displayName, newBalance, estimatedVideos)
              .catch((e) => logger.error("credit-events", "low-credits email error (free user)", e));
          }
        }
      }
    } catch (e) {
      logger.error("credit-events", "post-credit-spend error", e);
    }
  })();
}

/**
 * Call this when a credit-spending action FAILS because the user has no credits.
 * Sends the zero-credits hard-conversion email (once per day max via simple check).
 */
export function fireZeroCreditsEmail(userId: string): void {
  ;(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, lowCreditEmailSentAt: true },
      });
      if (!user) return;

      // Rate-limit: only send once per 24h (reuse lowCreditEmailSentAt)
      if (user.lowCreditEmailSentAt) {
        const hoursSince = (Date.now() - user.lowCreditEmailSentAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) return;
      }

      await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: new Date() } });
      if (await shouldSendCategory(userId, "usageAlerts")) {
        sendZeroCreditsEmail(user.email, greetingName(user.name))
          .catch((e) => logger.error("credit-events", "zero-credits email error", e));
      }
    } catch (e) {
      logger.error("credit-events", "zero-credits lookup error", e);
    }
  })();
}
