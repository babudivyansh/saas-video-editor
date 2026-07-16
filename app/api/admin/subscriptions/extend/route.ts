import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { extendSchema } from "@/lib/admin/schemas";

export const POST = withAdmin(async (req, { admin }) => {
  const { userId, months, expire } = await parseBody(req, extendSchema);

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

  await auditAdminAction(admin.userId, expire ? "subscription.expired" : "subscription.extended", userId, {
    before: { subscriptionEndsAt: user.subscriptionEndsAt },
    after: { subscriptionEndsAt, months: expire ? undefined : (months ?? 1) },
    ip: auditIp(req),
  });

  return NextResponse.json({ user: updated });
});
