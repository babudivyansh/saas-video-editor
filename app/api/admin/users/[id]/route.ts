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

  // Plan assignment: auto-apply the plan's full benefits so the admin doesn't
  // have to manually fill credits / subscriptionEndsAt / monthlyCredits / veo3.
  if ("planId" in body) {
    const planId: string | null = body.planId || null;
    data.planId = planId;

    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

      if (plan.kind === "subscription") {
        const months = plan.intervalMonths ?? 1;
        const monthlyCredits = plan.monthlyCredits ?? plan.credits;
        const now = new Date();
        const endsAt = new Date(now);
        endsAt.setMonth(endsAt.getMonth() + months);
        const nextRefill = new Date(now);
        nextRefill.setMonth(nextRefill.getMonth() + 1);

        // Apply subscription state — respect explicit overrides from the same request
        if (!("subscriptionEndsAt" in body)) data.subscriptionEndsAt = endsAt;
        if (!("monthlyCredits" in body)) data.monthlyCredits = monthlyCredits;
        if (!("veo3Enabled" in body)) data.veo3Enabled = plan.veo3Included;
        data.subscriptionId = null;
        data.nextRefillAt = months > 1 ? nextRefill : null;

        // Grant first month's credits — read current balance and add to it
        // (avoids Prisma's { increment } syntax which breaks in generic objects)
        if (!("credits" in body)) {
          const current = await prisma.user.findUnique({ where: { id }, select: { credits: true } });
          data.credits = (current?.credits ?? 0) + monthlyCredits;
        }
      } else if (plan.kind === "pack") {
        // One-time top-up: add the pack's credits unless admin overrides
        if (!("credits" in body)) {
          const current = await prisma.user.findUnique({ where: { id }, select: { credits: true } });
          data.credits = (current?.credits ?? 0) + plan.credits;
        }
      }
      // addon kind: just sets the planId link, no other credit side-effects
    } else {
      // Clearing the plan: wipe all subscription state
      if (!("subscriptionEndsAt" in body)) data.subscriptionEndsAt = null;
      if (!("monthlyCredits" in body)) data.monthlyCredits = 0;
      if (!("veo3Enabled" in body)) data.veo3Enabled = false;
      data.subscriptionId = null;
      data.nextRefillAt = null;
    }
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

  // Always sync Redis with the actual DB value after update
  if (data.credits !== undefined) {
    await redis.set(`credits:${id}`, String(user.credits), "EX", 3600);
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
