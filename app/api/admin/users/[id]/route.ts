import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { writeAuditLog } from "@/lib/tool-config";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("credits" in body) {
    const credits = Number(body.credits);
    if (!Number.isInteger(credits) || credits < 0) {
      return NextResponse.json({ error: "credits must be a non-negative integer" }, { status: 400 });
    }
    data.credits = credits;
  }
  if ("monthlyCredits" in body) {
    const mc = Number(body.monthlyCredits);
    if (!Number.isInteger(mc) || mc < 0) {
      return NextResponse.json({ error: "monthlyCredits must be a non-negative integer" }, { status: 400 });
    }
    data.monthlyCredits = mc;
  }
  if ("role" in body) {
    if (body.role !== "USER" && body.role !== "ADMIN") {
      return NextResponse.json({ error: "role must be USER or ADMIN" }, { status: 400 });
    }
    data.role = body.role;
  }
  if ("planId" in body) {
    data.planId = body.planId || null;
  }
  if ("veo3Enabled" in body) {
    data.veo3Enabled = Boolean(body.veo3Enabled);
  }
  if ("subscriptionEndsAt" in body) {
    data.subscriptionEndsAt = body.subscriptionEndsAt ? new Date(body.subscriptionEndsAt) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const before = await prisma.user.findUnique({
    where: { id },
    select: { credits: true, role: true, planId: true, veo3Enabled: true, subscriptionEndsAt: true, monthlyCredits: true },
  });

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, credits: true, monthlyCredits: true,
      role: true, veo3Enabled: true, subscriptionEndsAt: true, nextRefillAt: true,
      plan: { select: { id: true, name: true, slug: true } },
    },
  });

  if (data.credits !== undefined) {
    await redis.set(`credits:${id}`, String(data.credits), "EX", 3600);
  }

  await writeAuditLog({
    adminId: admin.userId,
    action: "user.updated",
    targetId: id,
    before,
    after: data,
  });

  return NextResponse.json({ user });
}
