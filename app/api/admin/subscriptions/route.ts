import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const subscribers = await prisma.user.findMany({
    where: { subscriptionEndsAt: { gt: now } },
    orderBy: { subscriptionEndsAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      credits: true,
      monthlyCredits: true,
      veo3Enabled: true,
      subscriptionEndsAt: true,
      nextRefillAt: true,
      plan: { select: { id: true, name: true, slug: true } },
      _count: { select: { purchases: true } },
    },
  });

  // MRR estimate: sum of monthlyCredits converted to revenue isn't directly available,
  // so we return count and let the UI compute. Also return total active count.
  return NextResponse.json({ subscribers, total: subscribers.length });
}
