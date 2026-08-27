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
import { logger } from "@/lib/logger";
import {
  sendFirstVideoSuccessEmail,
  sendLowCreditsEmail,
  sendZeroCreditsEmail,
} from "@/lib/email";
import { shouldSendCategory } from "@/lib/notifications";

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

      // ── 1. First-video success upsell (fires exactly once) ─────────────
      // firstVideoAt is the once-only guard. Previously the send was deferred
      // an hour via setTimeout — an in-process timer that was silently dropped
      // on any server restart within that hour, so the email often never went.
      // Send it now instead (still fire-and-forget relative to the caller,
      // since this whole function runs in an unawaited IIFE — awaiting here
      // adds no latency anywhere).
      //
      // The flag is written only AFTER a non-"failed" send outcome, not
      // before: writing it first (the original ordering) meant a transient
      // send error permanently lost this one-shot email, silently, with no
      // retry. "sent"/"suppressed"/"skipped-optout"/"dev-logged" are all
      // terminal outcomes that would recur identically on a retry, so only
      // "failed" leaves the flag unset — the next credit spend then retries
      // it naturally, with no separate retry infrastructure needed.
      if (!user.firstVideoAt) {
        const delivered = await sendFirstVideoSuccessEmail(user.email, displayName)
          .catch((e) => { logger.error("credit-events", "first-video email error", e); return false; });
        if (delivered) {
          await prisma.user.update({ where: { id: userId }, data: { firstVideoAt: now } });
        }
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
        select: { email: true, firstName: true, name: true, lowCreditEmailSentAt: true },
      });
      if (!user) return;

      // Rate-limit: only send once per 24h (reuse lowCreditEmailSentAt)
      if (user.lowCreditEmailSentAt) {
        const hoursSince = (Date.now() - user.lowCreditEmailSentAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) return;
      }

      await prisma.user.update({ where: { id: userId }, data: { lowCreditEmailSentAt: new Date() } });
      if (await shouldSendCategory(userId, "usageAlerts")) {
        sendZeroCreditsEmail(user.email, user.firstName ?? user.name ?? "")
          .catch((e) => logger.error("credit-events", "zero-credits email error", e));
      }
    } catch (e) {
      logger.error("credit-events", "zero-credits lookup error", e);
    }
  })();
}
