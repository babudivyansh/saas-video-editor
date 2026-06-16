import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  // Verify HMAC-SHA256 signature
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: {
      payment: {
        entity: {
          id: string;
          order_id: string;
          amount: number;
          notes: { userId?: string; packId?: string; credits?: string };
        };
      };
    };
  };

  // Idempotency check using payment ID as the unique event key
  const paymentId = event.payload?.payment?.entity?.id;
  if (!paymentId) return NextResponse.json({ received: true });

  const existing = await prisma.razorpayEvent.findUnique({ where: { id: paymentId } });
  if (existing) return NextResponse.json({ received: true });

  if (event.event === "payment.captured") {
    const entity = event.payload.payment.entity;
    const { notes } = entity;
    const userId = notes?.userId;
    const packId = notes?.packId;

    if (userId && packId) {
      // Resolve credits/amount from the DB plan (single source of truth);
      // fall back to the order notes if the plan was since removed.
      const plan = await prisma.plan.findUnique({ where: { slug: packId } });
      const credits = plan?.credits ?? parseInt(notes?.credits ?? "0", 10);
      const amountInPaise = plan?.priceInPaise ?? entity.amount ?? 0;

      if (credits > 0) {
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            credits: { increment: credits },
            // Record the current tier (last purchased plan).
            ...(plan ? { planId: plan.id } : {}),
          },
          select: { credits: true },
        });
        await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);

        // Record the purchase for billing history (id = paymentId keeps it idempotent).
        await prisma.purchase.create({
          data: {
            id: paymentId,
            userId,
            planId: plan?.id ?? null,
            amountInPaise,
            credits,
            status: "captured",
          },
        });
      }
    }
  }

  await prisma.razorpayEvent.create({ data: { id: paymentId, event: event.event } });

  return NextResponse.json({ received: true });
}
