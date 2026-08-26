import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { userPatchSchema } from "@/lib/admin/schemas";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const body = await parseBody(req, userPatchSchema);
  const data: Record<string, unknown> = {};

  if ("credits" in body) data.credits = body.credits;
  if ("monthlyCredits" in body) data.monthlyCredits = body.monthlyCredits;
  if ("role" in body) data.role = body.role;

  // Plan assignment: auto-apply the plan's full benefits so the admin doesn't
  // have to manually fill credits / subscriptionEndsAt / monthlyCredits.
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
    } else {
      // Clearing the plan: wipe all subscription state
      if (!("subscriptionEndsAt" in body)) data.subscriptionEndsAt = null;
      if (!("monthlyCredits" in body)) data.monthlyCredits = 0;
      data.subscriptionId = null;
      data.nextRefillAt = null;
    }
  }

  if ("subscriptionEndsAt" in body) {
    data.subscriptionEndsAt = body.subscriptionEndsAt ?? null;
  }
  if ("name" in body) {
    const name = (body.name ?? "").trim();
    data.name = name || null;
  }
  if (body.email !== undefined) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Email already in use by another account" }, { status: 409 });
    }
    data.email = body.email;
  }

  const before = await prisma.user.findUnique({
    where: { id },
    select: { credits: true, role: true, planId: true, subscriptionEndsAt: true, monthlyCredits: true },
  });

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, credits: true, monthlyCredits: true,
      role: true, subscriptionEndsAt: true, nextRefillAt: true,
      plan: { select: { id: true, name: true, slug: true } },
    },
  });

  // Always sync Redis with the actual DB value after update
  if (data.credits !== undefined) {
    await redis.set(`credits:${id}`, String(user.credits), "EX", 3600);
  }

  await auditAdminAction(admin.userId, "user.updated", id, { before, after: data, ip: auditIp(req) });

  return NextResponse.json({ user });
});

export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  if (id === admin.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // The harder-to-reverse action (delete) had a weaker guard than the
  // reversible one (moderate/suspend, which already refuses an ADMIN target)
  // — bring delete in line with that.
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Demote the admin role before deleting this account." }, { status: 409 });
  }

  const { allowed } = await rateLimit(`admin-user-delete:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  // Purchase rows are financial/audit records and can't cascade away with the
  // account (Purchase.user is onDelete: Restrict) — refuse up front with a
  // clear message instead of letting the delete below throw.
  const purchaseCount = await prisma.purchase.count({ where: { userId: id } });
  if (purchaseCount > 0) {
    return NextResponse.json(
      { error: "This user has billing history that must be retained for financial records, so the account can't be deleted." },
      { status: 409 },
    );
  }

  // Affiliate/Referral/Commission rows have no onDelete: Cascade, so they must
  // be cleared before the User row can be deleted, or Postgres throws a
  // foreign-key violation (this previously crashed with an unhandled 500 for
  // any affiliate-linked or referred user — see DELETE /api/auth/profile for
  // the same pattern used for self-service deletion).
  try {
    await prisma.$transaction([
      prisma.commission.deleteMany({ where: { referral: { referredUserId: id } } }),
      prisma.referral.deleteMany({ where: { referredUserId: id } }),
      prisma.commission.deleteMany({ where: { affiliate: { userId: id } } }),
      prisma.referral.deleteMany({ where: { affiliate: { userId: id } } }),
      prisma.affiliate.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
  } catch (err) {
    logger.error("admin.deleteUser", "request failed", err);
    return NextResponse.json({ error: "Could not delete this user — they may have related records that couldn't be cleared." }, { status: 409 });
  }

  // Clean up Redis session and credit cache
  await Promise.allSettled([
    redis.del(`session:${id}`),
    redis.del(`credits:${id}`),
  ]);

  await auditAdminAction(admin.userId, "user.deleted", id, { before: target, ip: auditIp(req) });

  return NextResponse.json({ success: true });
});
