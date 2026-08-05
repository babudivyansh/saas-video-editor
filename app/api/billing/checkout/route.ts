import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCoupon } from "@/lib/coupons";
import { getPlanPriceMinor, type Currency } from "@/lib/currency";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { cancelExistingSubscriptionForSwitch } from "@/lib/billing/subscription-switch";

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

  // ── Recurring flow: subscription-kind plans with a synced Razorpay Plan id
  // for the requested currency go through Subscriptions (true auto-renewal +
  // optional trial). Plans not yet synced fall back to the legacy one-time
  // order below, so rollout can happen plan-by-plan without breaking checkout.
  const razorpayPlanId = currency === "USD" ? basePlan.razorpayPlanIdUsd : basePlan.razorpayPlanIdInr;
  if (basePlan.kind === "subscription" && razorpayPlanId) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { trialUsedAt: true, razorpaySubscriptionId: true },
    });
    // Trial: Pro-tier only, once per account, requested explicitly by the client.
    const wantsTrial = body.trial === true && basePlan.tier === "pro" && !user?.trialUsedAt;

    // A user already on a subscription who buys another one (upgrade,
    // downgrade, or an early renewal) must have the old subscription
    // cancelled at Razorpay before the new one is created — otherwise it
    // keeps auto-charging, orphaned, after the activation webhook overwrites
    // this user's subscription link. This is an immediate cutover: the new
    // plan starts today and unused time on the old one isn't credited.
    const switchResult = await cancelExistingSubscriptionForSwitch(
      auth.userId,
      user?.razorpaySubscriptionId ?? null,
    );
    if (!switchResult.ok) {
      return NextResponse.json({ error: switchResult.error }, { status: switchResult.status });
    }

    let subscription;
    try {
      subscription = await razorpay.subscriptions.create({
        plan_id: razorpayPlanId,
        customer_notify: 1,
        total_count: 120, // ~10 years of monthly cycles; Razorpay requires a bound
        ...(wantsTrial ? { start_at: Math.floor(Date.now() / 1000) + 7 * 86400 } : {}),
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
