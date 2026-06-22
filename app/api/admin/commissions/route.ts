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

  const status = new URL(req.url).searchParams.get("status") ?? undefined;

  const commissions = await prisma.commission.findMany({
    where: status ? { status } : undefined,
    include: {
      affiliate: { include: { user: { select: { name: true, email: true } } } },
      referral: { include: { referredUser: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ commissions });
}
