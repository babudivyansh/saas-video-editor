import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notification = await prisma.notification.update({ where: { id }, data: { readAt: existing.readAt ?? new Date() } });
  return NextResponse.json({ notification });
}
