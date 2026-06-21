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

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws if the buffers differ in length, so reject a
  // wrong-length signature up front (still a 400, never a 500).
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
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
          // planId is the current field; packId is kept for backward compat with older orders
          notes: { userId?: string; planId?: string; packId?: string; addonIds?: string; kind?: string; credits?: string };
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
    // Accept both current (planId) and legacy (packId) note field names
    const planSlug = notes?.planId ?? notes?.packId;

    if (userId && planSlug) {
      // Resolve everything from the DB plan (single source of truth); fall back
      // to the order notes only if the plan was since removed.
      const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
      const amountInPaise = entity.amount ?? 0;
      const kind = plan?.kind ?? notes?.kind ?? "pack";

      if (kind === "subscription" && plan) {
        // Start (or replace) the subscription term. Grant the first month's
        // credits now; a scheduled job tops up monthlyCredits on each nextRefillAt
        // until subscriptionEndsAt.
        const months = plan.intervalMonths ?? 1;
        const monthlyCredits = plan.monthlyCredits ?? plan.credits;
        const now = new Date();
        const endsAt = new Date(now); endsAt.setMonth(endsAt.getMonth() + months);
        const nextRefill = new Date(now); nextRefill.setMonth(nextRefill.getMonth() + 1);

        // Parse any addon pack slugs bundled with this subscription purchase
        let addonSlugs: string[] = [];
        try {
          addonSlugs = notes?.addonIds ? JSON.parse(notes.addonIds) : [];
        } catch { /* ignore malformed JSON */ }

        const addons = addonSlugs.length
          ? await prisma.plan.findMany({ where: { slug: { in: addonSlugs }, kind: "pack" } })
          : [];
        const addonCredits = addons.reduce((s, a) => s + a.credits, 0);

        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            credits: { increment: monthlyCredits + addonCredits },
            planId: plan.id,
            subscriptionId: entity.order_id,
            subscriptionEndsAt: endsAt,
            // Only schedule a refill if the term is longer than one month.
            nextRefillAt: months > 1 ? nextRefill : null,
            monthlyCredits,
            veo3Enabled: plan.veo3Included,
          },
          select: { credits: true },
        });
        await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);

        await prisma.purchase.create({
          data: { id: paymentId, userId, planId: plan.id, amountInPaise, credits: monthlyCredits + addonCredits, status: "captured" },
        });
      } else if (kind === "addon") {
        // Veo3 unlock — no credits, just flip the flag for this subscription term.
        await prisma.user.update({ where: { id: userId }, data: { veo3Enabled: true } });
        await prisma.purchase.create({
          data: { id: paymentId, userId, planId: plan?.id ?? null, amountInPaise, credits: 0, status: "captured" },
        });
      } else {
        // One-time top-up pack: just add credits.
        const credits = plan?.credits ?? parseInt(notes?.credits ?? "0", 10);
        if (credits > 0) {
          const user = await prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: credits } },
            select: { credits: true },
          });
          await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);
          await prisma.purchase.create({
            data: { id: paymentId, userId, planId: plan?.id ?? null, amountInPaise, credits, status: "captured" },
          });
        }
      }
    }
  }

  await prisma.razorpayEvent.create({ data: { id: paymentId, event: event.event } });

  return NextResponse.json({ received: true });
}
