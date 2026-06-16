import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      credits: true,
      role: true,
      createdAt: true,
      plan: { select: { id: true, name: true, slug: true } },
      _count: { select: { projects: true } },
    },
  });
  return NextResponse.json({ users });
}
