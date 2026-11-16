import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { creatorProgramSchema } from "@/lib/admin/schemas";
import { getCreatorProgram, setCreatorProgram } from "@/lib/creator-program";
import { createUniqueCode } from "@/lib/affiliate";

// GET /api/admin/creator-program — programme settings + every creator partner
// with their progress. Creators are few (hand-picked), so no pagination.
export const GET = withAdmin(async () => {
  const settings = await getCreatorProgram();
  const rows = await prisma.affiliate.findMany({
    where: { isCreatorPartner: true },
    select: {
      id: true, code: true, status: true, creatorHandle: true, creatorSince: true,
      creatorGoalReachedAt: true, creatorRewardGrantedAt: true, totalEarned: true,
      user: { select: { name: true, email: true } },
      _count: { select: { referrals: true } },
    },
    orderBy: { creatorSince: "desc" },
  });
  const ids = rows.map((r) => r.id);
  const [qualified, paying] = await Promise.all([
    prisma.referral.groupBy({ by: ["affiliateId"], where: { affiliateId: { in: ids }, qualifiedAt: { not: null } }, _count: true }),
    prisma.referral.groupBy({ by: ["affiliateId"], where: { affiliateId: { in: ids }, status: "converted" }, _count: true }),
  ]);
  const creators = rows.map((r) => {
    const q = qualified.find((x) => x.affiliateId === r.id)?._count ?? 0;
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      handle: r.creatorHandle,
      since: r.creatorSince,
      user: r.user,
      signups: r._count.referrals,
      paying: paying.find((x) => x.affiliateId === r.id)?._count ?? 0,
      qualified: q,
      totalEarned: r.totalEarned,
      goalReachedAt: r.creatorGoalReachedAt,
      rewardGrantedAt: r.creatorRewardGrantedAt,
      stage: r.creatorRewardGrantedAt ? "granted" : q >= settings.goal ? "goal_reached" : "in_progress",
    };
  });
  return NextResponse.json({ settings, creators });
});

// PUT /api/admin/creator-program — replace the settings.
export const PUT = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, creatorProgramSchema);
  const before = await getCreatorProgram();
  const settings = await setCreatorProgram(body);
  await auditAdminAction(admin.userId, "creator_program.updated", undefined, {
    before,
    after: settings,
    ip: auditIp(req),
  });
  return NextResponse.json({ settings });
});

const addCreatorSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    handle: z.string().trim().max(60).optional(),
  })
  .strict();

// POST /api/admin/creator-program — make a signed-up user a creator partner by
// email. Creates their affiliate account (and referral code) if they never
// joined the affiliate programme, so onboarding a creator is one step.
export const POST = withAdmin(async (req, { admin }) => {
  const { email, handle } = await parseBody(req, addCreatorSchema);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) {
    return NextResponse.json({ error: "No Clipiro account uses that email. Ask the creator to sign up first." }, { status: 404 });
  }
  const existing = await prisma.affiliate.findUnique({ where: { userId: user.id } });
  if (existing?.isCreatorPartner) {
    return NextResponse.json({ error: "They're already a creator partner." }, { status: 409 });
  }
  const now = new Date();
  const affiliate = existing
    ? await prisma.affiliate.update({
        where: { id: existing.id },
        data: { isCreatorPartner: true, creatorSince: now, ...(handle ? { creatorHandle: handle } : {}) },
      })
    : await prisma.affiliate.create({
        data: {
          userId: user.id,
          code: await createUniqueCode(user.name ?? email),
          isCreatorPartner: true,
          creatorSince: now,
          creatorHandle: handle || null,
        },
      });
  await auditAdminAction(admin.userId, "affiliate.updated", affiliate.id, {
    before: existing ? { isCreatorPartner: false } : null,
    after: { isCreatorPartner: true, creatorHandle: affiliate.creatorHandle, created: !existing },
    ip: auditIp(req),
  });
  return NextResponse.json({ affiliate: { id: affiliate.id, code: affiliate.code } });
});
