import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The caller's purchase/credit top-up history for the billing tab.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bounded. This was an unbounded findMany, so the response grew without limit
  // as a long-lived account accumulated purchases and renewals — a monthly
  // subscriber adds twelve rows a year forever.
  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;

  const purchases = await prisma.purchase.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take,
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
