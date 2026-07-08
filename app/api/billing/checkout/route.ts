import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCoupon } from "@/lib/coupons";
import { env } from "@/lib/env";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accept both legacy { packId } and new { planId, addonIds? } shapes.
  const body = await req.json();
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

  // Resolve add-on packs (must be active, kind = "pack").
  const addons = addonSlugs.length
    ? await prisma.plan.findMany({
        where: { slug: { in: addonSlugs }, active: true, kind: "pack" },
      })
    : [];

  // Combined totals.
  const totalPaise = basePlan.priceInPaise + addons.reduce((s, a) => s + a.priceInPaise, 0);
  const totalCredits = basePlan.credits + addons.reduce((s, a) => s + a.credits, 0);
  const packName =
    basePlan.name + (addons.length ? " + " + addons.map(a => a.name).join(", ") : "");

  // Optional coupon: validate and discount the order amount. Credits granted are
  // unchanged (the discount affects price only, not value delivered).
  const couponCode: string = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
  let amountToCharge = totalPaise;
  let appliedCouponId: string | null = null;
  let appliedDiscount = 0;

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

  const order = await razorpay.orders.create({
    amount: amountToCharge,
    currency: basePlan.currency,
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

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID,
    packName,
    credits: totalCredits,
    discountInPaise: appliedDiscount,
  });
}
