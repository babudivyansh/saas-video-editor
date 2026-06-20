import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { writeAuditLog } from "@/lib/tool-config";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json() as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, credits: true, monthlyCredits: true, subscriptionEndsAt: true, nextRefillAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.subscriptionEndsAt || user.subscriptionEndsAt <= new Date()) {
    return NextResponse.json({ error: "User has no active subscription" }, { status: 400 });
  }

  const before = { credits: user.credits, nextRefillAt: user.nextRefillAt };

  // Advance nextRefillAt by 1 month from now (or null if past term end)
  const nextRefill = new Date();
  nextRefill.setMonth(nextRefill.getMonth() + 1);
  const nextRefillAt = nextRefill <= user.subscriptionEndsAt ? nextRefill : null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      credits: { increment: user.monthlyCredits },
      nextRefillAt,
    },
    select: { id: true, credits: true, nextRefillAt: true },
  });

  await redis.set(`credits:${userId}`, String(updated.credits), "EX", 3600);

  await writeAuditLog({
    adminId: admin.userId,
    action: "subscription.manual_refill",
    targetId: userId,
    before,
    after: { creditsAdded: user.monthlyCredits, nextRefillAt },
  });

  return NextResponse.json({ user: updated, creditsAdded: user.monthlyCredits });
}
