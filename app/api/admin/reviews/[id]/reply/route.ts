import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { notify } from "@/lib/notify";
import { shouldSendCategory } from "@/lib/notifications";
import { sendReviewReplyEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const replyBodySchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const SITE_URL = "https://clipiro.com";

export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { body } = await parseBody(req, replyBodySchema);

  const review = await prisma.review.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true, firstName: true } } },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const reply = await prisma.reviewReply.create({ data: { reviewId: id, adminId: admin.userId, body } });
    await auditAdminAction(admin.userId, "review.reply_created", id, { after: { body }, ip: auditIp(req) });
    const reviewUrl = `${SITE_URL}/reviews/${id}`;
    await notify({ userId: review.user.id, type: "review_reply", title: "Clipiro replied to your review", href: `/reviews/${id}` });
    if (await shouldSendCategory(review.user.id, "productUpdates")) {
      const authorName = review.user.name || review.user.firstName || "";
      await sendReviewReplyEmail(review.user.email, authorName, reviewUrl).catch((e) =>
        logger.warn("reviews", `review-reply email failed for ${review.user.email}`, { reason: (e as Error).message }),
      );
    }
    return NextResponse.json({ reply }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "This review already has a reply. Use PATCH to edit it." }, { status: 409 });
    }
    throw e;
  }
});

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { body } = await parseBody(req, replyBodySchema);

  const existing = await prisma.reviewReply.findUnique({ where: { reviewId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reply = await prisma.reviewReply.update({ where: { reviewId: id }, data: { body, editedAt: new Date() } });
  await auditAdminAction(admin.userId, "review.reply_updated", id, { before: { body: existing.body }, after: { body }, ip: auditIp(req) });
  return NextResponse.json({ reply });
});

export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const existing = await prisma.reviewReply.findUnique({ where: { reviewId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.reviewReply.delete({ where: { reviewId: id } });
  await auditAdminAction(admin.userId, "review.reply_deleted", id, { before: { body: existing.body }, ip: auditIp(req) });
  return NextResponse.json({ success: true });
});
