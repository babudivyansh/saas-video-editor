import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { adminNotesSchema } from "@/lib/admin/schemas";
import { listSessions } from "@/lib/auth";

// GET  /api/admin/users/[id]/detail — everything an admin needs about one user
// on a single page: profile/subscription, recent purchases, credit ledger
// (Generation rows), social accounts, affiliate state, login history, session
// liveness. Each list is capped; deeper digging uses the dedicated endpoints.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const { id } = params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, firstName: true, lastName: true,
      credits: true, monthlyCredits: true, role: true, createdAt: true,
      lastLoginAt: true, suspendedAt: true, adminNotes: true,
      subscriptionEndsAt: true, nextRefillAt: true,
      plan: { select: { id: true, name: true, slug: true, kind: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [purchases, generations, socialAccounts, affiliate, loginEvents, sessions, generationTotals] =
    await Promise.all([
      prisma.purchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, amountInPaise: true, credits: true, status: true, createdAt: true, plan: { select: { name: true, kind: true } } },
      }),
      prisma.generation.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, toolSlug: true, modelId: true, generationType: true, creditsCost: true, status: true, createdAt: true },
      }),
      prisma.socialAccount.findMany({
        where: { userId: id },
        select: { id: true, provider: true, status: true, username: true, displayName: true, followers: true, lastSyncedAt: true },
      }),
      prisma.affiliate.findUnique({
        where: { userId: id },
        select: { id: true, code: true, status: true, commissionRate: true, totalEarned: true, totalPaid: true },
      }),
      prisma.loginEvent.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { ip: true, device: true, country: true, createdAt: true },
      }),
      // Was reading the singular `session:${id}`, which nothing writes, so this
      // panel reported "no active session" for every user regardless.
      listSessions(id),
      prisma.generation.aggregate({ _sum: { creditsCost: true }, _count: true, where: { userId: id } }),
    ]);

  return NextResponse.json({
    user,
    purchases,
    generations,
    generationTotals: { count: generationTotals._count, creditsConsumed: generationTotals._sum.creditsCost ?? 0 },
    socialAccounts,
    affiliate,
    loginEvents,
    hasActiveSession: sessions.length > 0,
    activeSessionCount: sessions.length,
  });
});

// PATCH — admin notes only (everything else goes through the existing
// users/[id] PATCH with its plan-benefit logic).
export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { adminNotes } = await parseBody(req, adminNotesSchema);

  const before = await prisma.user.findUnique({ where: { id }, select: { adminNotes: true } });
  if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.update({ where: { id }, data: { adminNotes } });
  await auditAdminAction(admin.userId, "user.notes_updated", id, {
    before: { adminNotes: before.adminNotes },
    after: { adminNotes },
    ip: auditIp(req),
  });
  return NextResponse.json({ success: true });
});
