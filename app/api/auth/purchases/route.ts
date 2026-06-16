import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The caller's purchase/credit top-up history for the billing tab.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const purchases = await prisma.purchase.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountInPaise: true,
      credits: true,
      status: true,
      createdAt: true,
      plan: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json({ purchases });
}
