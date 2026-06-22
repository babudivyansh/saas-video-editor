import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { role: true } });
  return dbUser?.role === "ADMIN" ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const affiliates = await prisma.affiliate.findMany({
    include: {
      user: { select: { name: true, email: true } },
      referrals: { select: { id: true, status: true } },
      commissions: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ affiliates });
}
