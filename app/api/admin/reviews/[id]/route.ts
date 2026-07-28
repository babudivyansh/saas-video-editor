import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { reviewAdminPatchSchema } from "@/lib/admin/schemas";

export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, createdAt: true } },
      attachments: true,
      reply: true,
      _count: { select: { votes: true, reports: true } },
    },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const moderationHistory = await prisma.auditLog.findMany({
    where: { targetId: id, action: { startsWith: "review." } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ review, moderationHistory });
});

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const patch = await parseBody(req, reviewAdminPatchSchema);

  const before = await prisma.review.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = await prisma.review.update({ where: { id }, data: patch });
  await auditAdminAction(admin.userId, "review.edited", id, {
    before: { rating: before.rating, title: before.title, body: before.body, featureUsed: before.featureUsed },
    after: patch,
    ip: auditIp(req),
  });
  return NextResponse.json({ review });
});

export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.review.delete({ where: { id } });
  await auditAdminAction(admin.userId, "review.deleted", id, { before: existing, ip: auditIp(req) });
  return NextResponse.json({ success: true });
});
