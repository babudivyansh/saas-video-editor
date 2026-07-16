import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { refillSchema } from "@/lib/admin/schemas";

// Manual monthly-credit refill. Idempotent by construction: the grant is an
// atomic conditional update guarded on nextRefillAt (null or due), so a repeat
// POST — double-click, retry, concurrent tab — matches zero rows and returns
// 409 instead of double-crediting. A DB guard (not a Redis key) so it stays
// correct across restarts and Redis's in-memory fallback mode.
// `force: true` deliberately bypasses the due-date guard (audited as such);
// force+force = two grants by design.
export const POST = withAdmin(async (req, { admin }) => {
  const { userId, force } = await parseBody(req, refillSchema);
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, credits: true, monthlyCredits: true, subscriptionEndsAt: true, nextRefillAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.subscriptionEndsAt || user.subscriptionEndsAt <= now) {
    return NextResponse.json({ error: "User has no active subscription" }, { status: 400 });
  }
  if (user.monthlyCredits <= 0) {
    return NextResponse.json({ error: "User has no monthly credit allowance to refill" }, { status: 400 });
  }

  const before = { credits: user.credits, nextRefillAt: user.nextRefillAt };

  // Advance nextRefillAt by 1 month from now (or null if past term end)
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);
  const nextRefillAt = nextRefill <= user.subscriptionEndsAt ? nextRefill : null;

  const res = await prisma.user.updateMany({
    where: {
      id: userId,
      subscriptionEndsAt: { gt: now },
      ...(force ? {} : { OR: [{ nextRefillAt: null }, { nextRefillAt: { lte: now } }] }),
    },
    data: { credits: { increment: user.monthlyCredits }, nextRefillAt },
  });
  if (res.count === 0) {
    return NextResponse.json(
      { error: "Refill not due yet — this subscriber was already refilled for this cycle.", nextRefillAt: user.nextRefillAt },
      { status: 409 },
    );
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, credits: true, nextRefillAt: true },
  });
  await redis.set(`credits:${userId}`, String(updated!.credits), "EX", 3600);

  await auditAdminAction(admin.userId, "subscription.manual_refill", userId, {
    before,
    after: { creditsAdded: user.monthlyCredits, nextRefillAt, force: force ?? false },
    ip: auditIp(req),
  });

  return NextResponse.json({ user: updated, creditsAdded: user.monthlyCredits });
});
