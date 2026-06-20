import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/tool-config";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, months, expire } = await req.json() as { userId: string; months?: number; expire?: boolean };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, subscriptionEndsAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let subscriptionEndsAt: Date | null;
  if (expire) {
    subscriptionEndsAt = new Date();
  } else {
    const base = user.subscriptionEndsAt && user.subscriptionEndsAt > new Date()
      ? user.subscriptionEndsAt
      : new Date();
    subscriptionEndsAt = new Date(base);
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + (months ?? 1));
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { subscriptionEndsAt },
    select: { id: true, subscriptionEndsAt: true },
  });

  await writeAuditLog({
    adminId: admin.userId,
    action: expire ? "subscription.expired" : "subscription.extended",
    targetId: userId,
    before: { subscriptionEndsAt: user.subscriptionEndsAt },
    after: { subscriptionEndsAt },
  });

  return NextResponse.json({ user: updated });
}
