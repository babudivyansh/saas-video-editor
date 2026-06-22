import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { role: true } });
  return dbUser?.role === "ADMIN" ? user : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { status, commissionRate } = body;

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (commissionRate !== undefined) data.commissionRate = parseFloat(commissionRate);

  const affiliate = await prisma.affiliate.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      adminId: admin.userId,
      action: "affiliate.updated",
      targetId: id,
      after: JSON.stringify(data),
    },
  });

  return NextResponse.json({ affiliate });
}
