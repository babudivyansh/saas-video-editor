/**
 * lib/credit-events.ts
 *
 * Handles email side-effects after a user spends credits:
 *   1. First-video success upsell (fires once, 1h after first render)
 *   2. Low-credits warning (20% threshold, once per billing cycle)
 *   3. Zero-credits alert (fires when render fails due to no credits)
 *
 * All operations are fire-and-forget (non-fatal) — never let email logic
 * block or break the primary user action.
 */

import { prisma } from "@/lib/prisma";
import {
  sendFirstVideoSuccessEmail,
  sendLowCreditsEmail,
  sendZeroCreditsEmail,
} from "@/lib/email";

/**
 * Call this after a successful credit-spending action (render, voiceover, etc.)
 * Handles first-video email and low-credits email in a non-blocking way.
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
          firstName: true,
          name: true,
          firstVideoAt: true,
          monthlyCredits: true,
          lowCreditEmailSentAt: true,
        },
      });
      if (!user) return;

      const displayName = user.firstName ?? user.name ?? "";
      const now = new Date();

      // ── 1. First-video success upsell ──────────────────────────────────
      // Fires exactly once, 1 hour after the first successful render.
      if (!user.firstVideoAt) {
        await prisma.user.update({ where: { id: userId }, data: { firstVideoAt: now } });
        // Schedule via setTimeout so the response goes out first
        setTimeout(() => {
          sendFirstVideoSuccessEmail(user.email, displayName)
            .catch((e) => console.error("[credit-events] first-video email error", e));
        }, 60 * 60 * 1000); // 1 hour
      }

      // ── 2. Low-credits warning (≤20% of monthly allocation) ────────────
      // Only send if user is a subscriber (monthlyCredits > 0) and
      // we haven't already sent it this billing cycle.
      const monthlyAllocation = user.monthlyCredits ?? 0;
      if (monthlyAllocation > 0) {
        const threshold20pct = Math.ceil(monthlyAllocation * 0.2);
        const alreadySent = !!user.lowCreditEmailSentAt;

        if (!alreadySent && newBalance <= threshold20pct && newBalance > 0) {
          const estimatedVideos = Math.floor(newBalance / 2); // assume avg 2 credits/video
          await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: now } });
          sendLowCreditsEmail(user.email, displayName, newBalance, estimatedVideos)
            .catch((e) => console.error("[credit-events] low-credits email error", e));
        }
      } else {
        // Free user: warn at ≤2 credits remaining (out of 10 default)
        if (newBalance <= 2 && newBalance > 0 && !user.lowCreditEmailSentAt) {
          const estimatedVideos = newBalance;
          await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: now } });
          sendLowCreditsEmail(user.email, displayName, newBalance, estimatedVideos)
            .catch((e) => console.error("[credit-events] low-credits email error (free user)", e));
        }
      }
    } catch (e) {
      console.error("[credit-events] post-credit-spend error", e);
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
        select: { email: true, firstName: true, name: true, lowCreditEmailSentAt: true },
      });
      if (!user) return;

      // Rate-limit: only send once per 24h (reuse lowCreditEmailSentAt)
      if (user.lowCreditEmailSentAt) {
        const hoursSince = (Date.now() - user.lowCreditEmailSentAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) return;
      }

      await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: new Date() } });
      sendZeroCreditsEmail(user.email, user.firstName ?? user.name ?? "")
        .catch((e) => console.error("[credit-events] zero-credits email error", e));
    } catch (e) {
      console.error("[credit-events] zero-credits lookup error", e);
    }
  })();
}
