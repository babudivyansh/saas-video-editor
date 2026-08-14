import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireBonusCredits, getBalances, grantCredits, setSubscriptionCredits } from "@/lib/credits";
import {
  BONUS_CREDITS_EXPIRY_DAYS,
  FREE_TIER_MONTHLY_BONUS_CREDITS,
  SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER,
} from "@/lib/plans/tiers";
import { sendCreditsRefilledEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import Razorpay from "razorpay";

// Constructed on first use, not at module load: this route is imported by
// tests and by the scheduler, and the SDK throws at construction time when
// key_id is absent.
let razorpayClient: Razorpay | null = null;
function getRazorpay(): Razorpay {
  razorpayClient ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return razorpayClient;
}

// How long past subscriptionEndsAt a *recurring* subscription is left alone
// before we give up on the renewal. subscriptionEndsAt already includes a
// 3-day grace, so this is the additional window Razorpay has to land a retried
// charge. Prepaid/legacy subscriptions are unaffected and lapse at term end.
const RECURRING_LAPSE_GRACE_DAYS = 14;

// Credit-economy cron (hourly/daily via external scheduler):
//
//   GET /api/cron/refill-credits   (Authorization: Bearer <CRON_SECRET>)
//
// Four steps, in this order:
//   1. Paid refills with rollover — due subscribers get monthlyCredits into
//      the subscription bucket, capped at 2x the monthly grant (unused
//      subscription credits roll over up to one extra month's worth).
//      Runs BEFORE expiry: nextRefillAt always falls strictly inside the paid
//      term, so a due refill was paid for even when the cron fires late —
//      expiring first would silently swallow the final refill.
//   2. Expire lapsed subscriptions — clears plan state and zeroes the
//      subscription bucket. Purchased (pack) and bonus credits survive.
//   3. Expire stale bonus credits (30 days after the latest bonus grant).
//   4. Free-tier monthly grant — users without a plan get a small bonus-
//      credit drip so the product stays tasteable at zero credits.
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("refill-credits")).catch(() => {});

  const now = new Date();
  let refilled = 0;
  let expired = 0;
  let bonusExpired = 0;
  let freeGranted = 0;

  // ── 1. Paid refills with rollover cap ───────────────────────────────────────
  // Grandfathering: users on a real Razorpay Subscription renew via the
  // subscription.charged webhook (lib/fulfillment.ts fulfillSubscriptionCharge),
  // never via this cron — nextRefillAt is set to null for them at grant time,
  // but excluding by razorpaySubscriptionId here too guards against any state
  // where both would otherwise fire.
  const due = await prisma.user.findMany({
    where: { nextRefillAt: { not: null, lte: now }, razorpaySubscriptionId: null },
    select: { id: true, monthlyCredits: true, nextRefillAt: true, subscriptionEndsAt: true },
  });

  for (const u of due) {
    const grant = u.monthlyCredits ?? 0;

    // Advance nextRefillAt by one month; null it out once it would pass term end.
    const next = new Date(u.nextRefillAt!);
    next.setMonth(next.getMonth() + 1);
    const nextRefillAt = u.subscriptionEndsAt && next >= u.subscriptionEndsAt ? null : next;

    // Rollover: subscription bucket = min(current + grant, cap × grant). The
    // ledger records only the credits actually applied.
    const cap = grant * SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER;
    const bal = await getBalances(u.id);
    const applied = Math.max(Math.min(bal.subscription + grant, cap) - bal.subscription, 0);
    if (applied > 0) {
      await grantCredits({ userId: u.id, bucket: "subscription", amount: applied, reason: "grant:refill" });
    }
    const updated = await prisma.user.update({
      where: { id: u.id },
      data: { nextRefillAt, lowCreditEmailSentAt: null },
      select: { email: true, firstName: true, name: true, credits: true },
    });

    // ── Credits refill notification (non-fatal) ────────────────────
    sendCreditsRefilledEmail(
      updated.email,
      updated.firstName ?? updated.name ?? "",
      applied,
      updated.credits,
    ).catch((e) => logger.error("cron/refill-credits", `email error for ${u.id}`, e));

    refilled++;
  }

  // ── 2. Expire lapsed subscriptions ──────────────────────────────────────────
  // A recurring Razorpay Subscription must NOT be lapsed the moment
  // subscriptionEndsAt passes. That timestamp already carries only a 3-day
  // grace (lib/fulfillment.ts), and a renewal can legitimately land later than
  // that — a soft decline Razorpay is still retrying, a bank outage, a webhook
  // backlog. Lapsing nulled razorpaySubscriptionId, so when the retry finally
  // arrived fulfillSubscriptionCharge could not find the user: the customer was
  // charged and got nothing, permanently, with no Purchase row and no alert.
  // Meanwhile the mandate stayed live at Razorpay, so they kept being billed
  // while sitting on the free tier.
  //
  // So: prepaid/legacy subscriptions lapse at term end as before, and recurring
  // ones get a longer window for the retry to succeed. Only once that window
  // closes do we give up — and then we cancel the mandate first, so we never
  // leave a free-tier account being charged.
  const lapsedPrepaid = await prisma.user.findMany({
    where: { subscriptionEndsAt: { not: null, lte: now }, razorpaySubscriptionId: null },
    select: { id: true, razorpaySubscriptionId: true },
  });

  const recurringCutoff = new Date(now.getTime() - RECURRING_LAPSE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const lapsedRecurring = await prisma.user.findMany({
    where: { subscriptionEndsAt: { not: null, lte: recurringCutoff }, razorpaySubscriptionId: { not: null } },
    select: { id: true, razorpaySubscriptionId: true },
  });

  for (const u of [...lapsedPrepaid, ...lapsedRecurring]) {
    // Stop the mandate before dropping the local link, so a still-live
    // subscription can't keep charging a user we've moved to the free tier.
    // If this fails, skip the user entirely and retry next run rather than
    // orphaning the subscription — that's the exact failure this block exists
    // to prevent.
    if (u.razorpaySubscriptionId) {
      try {
        await getRazorpay().subscriptions.cancel(u.razorpaySubscriptionId, false);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Already cancelled/completed at Razorpay is a success for our purposes.
        const alreadyGone = /not found|already|invalid.*state|cancelled/i.test(message);
        if (!alreadyGone) {
          logger.error(
            "cron/refill-credits",
            `could not cancel subscription ${u.razorpaySubscriptionId} for ${u.id} — leaving the link intact and retrying next run`,
            e,
          );
          continue;
        }
      }
    }

    await prisma.user.update({
      where: { id: u.id },
      data: {
        planId: null,
        subscriptionId: null,
        razorpaySubscriptionId: null,
        subscriptionEndsAt: null,
        nextRefillAt: null,
        monthlyCredits: 0,
        subscriptionCancelledAt: null,
        // The lapsed user rejoins the free tier's monthly drip from the NEXT
        // cycle (anchoring at `now` would grant the drip in this same run).
        freeCreditsRefillAt: new Date(new Date(now).setMonth(now.getMonth() + 1)),
      },
    });
    // Subscription credits end with the subscription; purchased/bonus survive.
    await setSubscriptionCredits(u.id, 0, "lapse");
    expired++;
  }

  // ── 3. Expire stale bonus credits ───────────────────────────────────────────
  const staleBonus = await prisma.user.findMany({
    where: { bonusCreditsExpireAt: { not: null, lte: now }, bonusCredits: { gt: 0 } },
    select: { id: true },
  });
  for (const u of staleBonus) {
    if ((await expireBonusCredits(u.id)) > 0) bonusExpired++;
  }

  // ── 4. Free-tier monthly grant ──────────────────────────────────────────────
  const freeDue = await prisma.user.findMany({
    where: { planId: null, freeCreditsRefillAt: { not: null, lte: now } },
    select: { id: true, freeCreditsRefillAt: true },
  });
  for (const u of freeDue) {
    const nextFree = new Date(u.freeCreditsRefillAt!);
    nextFree.setMonth(nextFree.getMonth() + 1);
    // If the anchor is far in the past (dormant account), re-anchor from now.
    const anchor = nextFree <= now ? new Date(new Date(now).setMonth(now.getMonth() + 1)) : nextFree;
    await grantCredits({
      userId: u.id,
      bucket: "bonus",
      amount: FREE_TIER_MONTHLY_BONUS_CREDITS,
      reason: "grant:free-tier",
      bonusExpiresAt: new Date(now.getTime() + BONUS_CREDITS_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    });
    await prisma.user.update({ where: { id: u.id }, data: { freeCreditsRefillAt: anchor } });
    freeGranted++;
  }

  return NextResponse.json({
    ok: true,
    refilled,
    expired,
    bonusExpired,
    freeGranted,
    at: now.toISOString(),
  });
}
