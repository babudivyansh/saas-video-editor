import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCoupon, SUBSCRIPTION_COUPON_ERROR } from "@/lib/coupons";
import { getPlanPriceMinor, type Currency } from "@/lib/currency";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { trialEligibility } from "@/lib/billing/trial-eligibility";
import { isTrialPlan, TRIAL_DAYS } from "@/lib/plans/tiers";
import { syncRazorpayPlan } from "@/lib/billing/razorpay-plans";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accept both legacy { packId } and new { planId, addonIds? } shapes.
  // Guarded: an unparseable body used to throw and surface as a raw 500.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const planSlug: string | undefined = body.planId ?? body.packId;
  const addonSlugs: string[] = Array.isArray(body.addonIds) ? body.addonIds : [];

  if (!planSlug) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  // Resolve the base plan (subscription or pack).
  const basePlan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!basePlan || !basePlan.active) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Packs are open to all users — no active subscription required.
  // This lets lapsed subscribers top up and recaptures churned users.

  // Requested checkout currency (defaults to the plan's stored currency,
  // i.e. INR). USD is a display/price-book concern, not a second Plan row —
  // see lib/currency.ts. Coupons are INR-native (percent/fixed off the stored
  // priceInPaise), so they apply on INR checkout only; a code sent with USD is
  // rejected below rather than dropped.
  const currency: Currency = body.currency === "USD" ? "USD" : "INR";

  // Resolve add-on packs (must be active, kind = "pack").
  const addons = addonSlugs.length
    ? await prisma.plan.findMany({
        where: { slug: { in: addonSlugs }, active: true, kind: "pack" },
      })
    : [];

  const totalCredits = basePlan.credits + addons.reduce((s, a) => s + a.credits, 0);
  const packName =
    basePlan.name + (addons.length ? " + " + addons.map(a => a.name).join(", ") : "");

  let amountToCharge: number;
  let appliedCouponId: string | null = null;
  let appliedDiscount = 0;
  const couponCode: string = typeof body.couponCode === "string" ? body.couponCode.trim() : "";

  // A subscription is exactly its plan. It is billed at the synced Razorpay
  // plan amount, so add-ons and coupon discounts shown in the modal were never
  // charged or applied — the customer paid full price and got no add-on
  // credits. Both are refused rather than silently dropped. Packs are still
  // sold on their own (with pack coupons), to anyone.
  if (basePlan.kind === "subscription") {
    if (addonSlugs.length > 0) {
      return NextResponse.json(
        { error: "Credit packs can't be bundled with a subscription. Buy them separately after subscribing." },
        { status: 400 },
      );
    }
    if (couponCode) return NextResponse.json({ error: SUBSCRIPTION_COUPON_ERROR }, { status: 400 });
  }

  if (currency === "USD") {
    // Reject rather than ignore. Silently dropping the code meant a client that
    // had shown the customer a discounted total went on to charge full price
    // with a 200 — the worst possible outcome. The UI hides the coupon field on
    // USD; anything that still sends one is a bug and should say so.
    if (couponCode) {
      return NextResponse.json(
        { error: "Coupons are only available on INR checkout." },
        { status: 400 },
      );
    }
    const addonUsd = await Promise.all(addons.map((a) => getPlanPriceMinor(a.slug, a.priceInPaise, "USD")));
    amountToCharge = (await getPlanPriceMinor(basePlan.slug, basePlan.priceInPaise, "USD")) + addonUsd.reduce((s, c) => s + c, 0);
  } else {
    const totalPaise = basePlan.priceInPaise + addons.reduce((s, a) => s + a.priceInPaise, 0);
    amountToCharge = totalPaise;

    // Optional coupon: validate and discount the order amount. Credits
    // granted are unchanged (the discount affects price only).
    if (couponCode) {
      const result = await validateCoupon({
        code: couponCode,
        userId: auth.userId,
        cartKind: basePlan.kind as "subscription" | "pack" | "addon",
        planSlug: basePlan.slug,
        amountInPaise: totalPaise,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      amountToCharge = result.finalPaise;
      appliedCouponId = result.couponId;
      appliedDiscount = result.discountInPaise;
    }
  }

  // ── Recurring flow: EVERY plan purchase is a Razorpay Subscription, so every
  // one registers a payment mandate (card e-mandate / UPI Autopay) and renews
  // automatically. Unsynced plans used to fall back to a one-time order: the
  // customer paid once, got no mandate, and silently lapsed at term end. A plan
  // with no Razorpay Plan for this currency is now synced on its first checkout
  // (syncRazorpayPlan is idempotent), instead of waiting on someone to press
  // the sync button in /admin/pricing.
  let razorpayPlanId = currency === "USD" ? basePlan.razorpayPlanIdUsd : basePlan.razorpayPlanIdInr;
  if (basePlan.kind === "subscription" && !razorpayPlanId) {
    const synced = await syncRazorpayPlan(basePlan, currency);
    if (synced.ok) {
      razorpayPlanId = synced.razorpayPlanId;
    } else if (currency === "INR") {
      logger.error("billing/checkout", `could not sync ${basePlan.slug} (INR) to Razorpay: ${synced.error}`);
      return NextResponse.json(
        { error: "This plan can't be purchased right now. Please try again in a few minutes." },
        { status: 503 },
      );
    } else {
      // USD recurring needs international recurring enabled on the Razorpay
      // account. If Razorpay refuses the plan, keep selling it one-time rather
      // than blocking every USD plan sale — loudly, so it gets fixed.
      logger.error(
        "billing/checkout",
        `USD plan ${basePlan.slug} could not be synced (${synced.error}) — selling it ONE-TIME, with no mandate or renewal`,
      );
    }
  }

  // Trials only exist on the recurring flow. Falling through to the one-time
  // order below would charge the full amount today, which is the opposite of
  // what the customer was just shown.
  if (body.trial === true && basePlan.kind === "subscription" && !razorpayPlanId) {
    return NextResponse.json(
      { error: "The free trial isn't available for this plan right now. You can still subscribe normally." },
      { status: 409 },
    );
  }

  // Trial eligibility is decided HERE and refused loudly. It used to degrade
  // silently: an ineligible trial request became an ordinary subscription that
  // charged the full price at once, straight after a modal that said "Due
  // today ₹0". The same rule is re-checked when the mandate is authenticated
  // (lib/billing/trial.ts), since two parallel checkouts both pass this one.
  if (body.trial === true) {
    const reason = isTrialPlan(basePlan) ? await trialEligibility(auth.userId) : "not-trial-plan";
    if (reason) {
      return NextResponse.json(
        {
          error: reason === "not-trial-plan"
            ? "The free trial is only available on the monthly Pro plan."
            : "The free trial is for first-time subscribers only. You can still subscribe normally.",
          code: "trial_ineligible",
        },
        { status: 409 },
      );
    }
  }

  if (basePlan.kind === "subscription" && razorpayPlanId) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { subscriptionEndsAt: true },
    });
    const wantsTrial = body.trial === true;

    // Set only from the billing dunning banner's "View plans" (a failed
    // payment retry, not a normal upgrade) — the customer already paid for
    // time remaining on their current period, so this subscription shouldn't
    // start billing until that period actually ends. Recomputed from the
    // user's own subscriptionEndsAt server-side, never trusted from the
    // client as a raw timestamp. Falls through to an immediate start if the
    // period has already lapsed (nothing left to preserve).
    const resumeFromPeriodEnd = body.resumeFromPeriodEnd === true;
    const deferStart =
      resumeFromPeriodEnd && user?.subscriptionEndsAt && user.subscriptionEndsAt.getTime() > Date.now()
        ? Math.floor(user.subscriptionEndsAt.getTime() / 1000)
        : undefined;

    // NOTE: the old subscription is NOT cancelled here. Cancelling before the
    // customer has paid meant that abandoning the Razorpay modal killed the
    // subscription they already had — auto-renewal silently gone, with
    // subscriptionCancelledAt unset so the billing UI still said "Renews on".
    // The cutover now happens in the subscription.activated webhook, which
    // only fires once the NEW subscription is actually live and still runs
    // before that handler overwrites razorpaySubscriptionId (the orphaned
    // auto-charging mandate this guards against).

    let subscription;
    try {
      subscription = await razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        customer_notify: 1,
        total_count: 120, // ~10 years of monthly cycles; Razorpay requires a bound
        // Trial delay and resume-from-period-end are mutually exclusive in
        // practice (a dunning customer won't also be trial-eligible), but kept
        // as explicit separate branches rather than merged into one condition
        // so it's never ambiguous which one fired.
        ...(deferStart
          ? { start_at: deferStart }
          : wantsTrial
            ? { start_at: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86400 }
            : {}),
        notes: {
          userId: auth.userId,
          planId: basePlan.slug,
          trial: wantsTrial ? "1" : "0",
        },
      });
    } catch (e) {
      logger.error("billing/checkout", `subscriptions.create failed for ${basePlan.slug}`, e);
      return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      mode: "subscription" as const,
      subscriptionId: subscription.id,
      keyId: env.RAZORPAY_KEY_ID,
      packName,
      credits: totalCredits,
      trial: wantsTrial,
    });
  }

  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountToCharge,
      currency,
      receipt: `order_${auth.userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        userId: auth.userId,
        planId: basePlan.slug,
        addonIds: JSON.stringify(addonSlugs),
        kind: basePlan.kind,
        credits: String(totalCredits),
        ...(appliedCouponId
          ? { couponId: appliedCouponId, couponCode: couponCode.toUpperCase(), discountInPaise: String(appliedDiscount) }
          : {}),
      },
    });
  } catch (e) {
    logger.error("billing/checkout", `orders.create failed for ${basePlan.slug}`, e);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }

  return NextResponse.json({
    mode: "order" as const,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID,
    packName,
    credits: totalCredits,
    discountInPaise: appliedDiscount,
  });
}

// Every call hits Razorpay's orders/subscriptions API, so an authenticated
// user could previously spam order creation without limit — provider quota
// abuse plus junk orders and coupon-validation load. Sized to allow genuine
// retries and currency/plan switching without obstructing a real checkout.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "billing:checkout" });
