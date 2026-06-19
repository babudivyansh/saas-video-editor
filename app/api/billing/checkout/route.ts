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

  // packId is the plan slug (e.g. "pack_starter" or "sub_pro_3mo"). Plans live in
  // the DB so the admin pricing editor is the single source of truth for amounts.
  const { packId } = await req.json();
  const plan = packId ? await prisma.plan.findUnique({ where: { slug: packId } }) : null;
  if (!plan || !plan.active) return NextResponse.json({ error: "Invalid packId" }, { status: 400 });

  // Top-up packs are subscriber-only: require an active subscription.
  if (plan.kind === "pack") {
    const me = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { subscriptionEndsAt: true },
    });
    const active = me?.subscriptionEndsAt && me.subscriptionEndsAt > new Date();
    if (!active) {
      return NextResponse.json(
        { error: "Top-up packs require an active subscription. Subscribe to a plan first." },
        { status: 403 },
      );
    }
  }

  const order = await razorpay.orders.create({
    amount: plan.priceInPaise,
    currency: plan.currency,
    receipt: `order_${auth.userId.slice(0, 8)}_${Date.now()}`,
    notes: { userId: auth.userId, packId: plan.slug, kind: plan.kind, credits: String(plan.credits) },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    packName: plan.name,
    credits: plan.credits,
  });
}
