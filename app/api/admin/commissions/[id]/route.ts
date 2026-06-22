import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { role: true } });
  return dbUser?.role === "ADMIN" ? user : null;
}

// POST /api/admin/commissions/[id]  body: { action: "release" | "reject" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action } = await req.json();

  if (action === "release") {
    const commission = await prisma.commission.update({
      where: { id },
      data: { status: "available", availableAt: new Date() },
    });
    return NextResponse.json({ commission });
  }

  if (action === "reject") {
    const commission = await prisma.commission.update({
      where: { id },
      data: { status: "rejected" },
    });
    // Deduct from affiliate totalEarned
    await prisma.affiliate.update({
      where: { id: commission.affiliateId },
      data: { totalEarned: { decrement: commission.amount } },
    });
    return NextResponse.json({ commission });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
