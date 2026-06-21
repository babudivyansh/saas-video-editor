import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
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

  // Top-up packs (standalone, no subscription) still require an active subscription.
  // But when a pack is bundled as an addon alongside a subscription purchase we allow it.
  const isStandalonePack = basePlan.kind === "pack" && addonSlugs.length === 0;
  if (isStandalonePack) {
    const me = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { subscriptionEndsAt: true },
    });
    const active = me?.subscriptionEndsAt && me.subscriptionEndsAt > new Date();
    if (!active) {
      return NextResponse.json(
        { error: "Credit packs require an active subscription. Subscribe to a plan first." },
        { status: 403 },
      );
    }
  }

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

  const order = await razorpay.orders.create({
    amount: totalPaise,
    currency: basePlan.currency,
    receipt: `order_${auth.userId.slice(0, 8)}_${Date.now()}`,
    notes: {
      userId: auth.userId,
      planId: basePlan.slug,
      addonIds: JSON.stringify(addonSlugs),
      kind: basePlan.kind,
      credits: String(totalCredits),
    },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    packName,
    credits: totalCredits,
  });
}
