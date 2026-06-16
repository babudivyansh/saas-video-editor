import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// All purchases across users — the transactions / "subscriptions" view.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const purchases = await prisma.purchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      amountInPaise: true,
      credits: true,
      status: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json({ purchases });
}
