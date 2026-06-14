import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

// Credit packs keyed by Stripe price ID
const CREDIT_PACKS: Record<string, number> = {
  // Set these to your real Stripe price IDs
  price_starter: 60,
  price_pro: 180,
  price_unlimited: 600,
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing) return NextResponse.json({ received: true });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const priceId = session.metadata?.priceId;

    if (userId && priceId) {
      const credits = CREDIT_PACKS[priceId] ?? 60;
      const user = await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
        select: { credits: true },
      });
      await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);
    }
  }

  await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });

  return NextResponse.json({ received: true });
}
