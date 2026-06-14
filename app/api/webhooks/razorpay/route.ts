import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const CREDITS_PER_PACK: Record<string, number> = {
  pack_starter: 60,
  pack_pro: 180,
  pack_studio: 600,
};

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
    const { notes } = event.payload.payment.entity;
    const userId = notes?.userId;
    const packId = notes?.packId;

    if (userId && packId) {
      const credits = CREDITS_PER_PACK[packId] ?? parseInt(notes?.credits ?? "0", 10);
      if (credits > 0) {
        const user = await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: credits } },
          select: { credits: true },
        });
        await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);
      }
    }
  }

  await prisma.razorpayEvent.create({ data: { id: paymentId, event: event.event } });

  return NextResponse.json({ received: true });
}
