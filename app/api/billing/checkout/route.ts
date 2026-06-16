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

  // packId is the plan slug (e.g. "pack_starter"). Plans live in the DB so the
  // admin pricing editor is the single source of truth for checkout amounts.
  const { packId } = await req.json();
  const plan = packId ? await prisma.plan.findUnique({ where: { slug: packId } }) : null;
  if (!plan || !plan.active) return NextResponse.json({ error: "Invalid packId" }, { status: 400 });

  const order = await razorpay.orders.create({
    amount: plan.priceInPaise,
    currency: plan.currency,
    receipt: `order_${auth.userId.slice(0, 8)}_${Date.now()}`,
    notes: { userId: auth.userId, packId: plan.slug, credits: String(plan.credits) },
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
