import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { reviewModerateSchema } from "@/lib/admin/schemas";
import { notify } from "@/lib/notify";
import { shouldSendCategory } from "@/lib/notifications";
import { sendReviewPublishedEmail, sendReviewRejectedEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const SITE_URL = "https://clipiro.com";

// POST /api/admin/reviews/[id]/moderate  body: { action: approve|reject|hide|unhide|pin|unpin, reason? }
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { action, reason } = await parseBody(req, reviewModerateSchema);

  const review = await prisma.review.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true, firstName: true } } },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip = auditIp(req);
  const now = new Date();
  const authorName = review.user.name || review.user.firstName || "";

  switch (action) {
    case "approve": {
      if (review.status === "published") return NextResponse.json({ error: "Already published" }, { status: 409 });
      const updated = await prisma.review.update({
        where: { id },
        data: { status: "published", moderatedBy: admin.userId, moderatedAt: now, rejectionReason: null },
      });
      await auditAdminAction(admin.userId, "review.approved", id, { before: { status: review.status }, after: { status: "published" }, reason, ip });
      const reviewUrl = `${SITE_URL}/reviews/${id}`;
      await notify({ userId: review.user.id, type: "review_published", title: "Your review is live!", body: "Thanks for sharing your experience with Clipiro.", href: `/reviews/${id}` });
      if (await shouldSendCategory(review.user.id, "productUpdates")) {
        await sendReviewPublishedEmail(review.user.email, authorName, reviewUrl).catch((e) =>
          logger.warn("reviews", `review-published email failed for ${review.user.email}`, { reason: (e as Error).message }),
        );
      }
      return NextResponse.json({ review: updated });
    }
    case "reject": {
      const updated = await prisma.review.update({
        where: { id },
        data: { status: "rejected", moderatedBy: admin.userId, moderatedAt: now, rejectionReason: reason! },
      });
      await auditAdminAction(admin.userId, "review.rejected", id, { before: { status: review.status }, after: { status: "rejected" }, reason, ip });
      await notify({ userId: review.user.id, type: "review_rejected", title: "Your review wasn't approved", body: reason, href: "/dashboard?editReview=1" });
      if (await shouldSendCategory(review.user.id, "productUpdates")) {
        await sendReviewRejectedEmail(review.user.email, authorName, reason).catch((e) =>
          logger.warn("reviews", `review-rejected email failed for ${review.user.email}`, { reason: (e as Error).message }),
        );
      }
      return NextResponse.json({ review: updated });
    }
    case "hide": {
      if (review.status === "hidden") return NextResponse.json({ error: "Already hidden" }, { status: 409 });
      const updated = await prisma.review.update({
        where: { id },
        data: { status: "hidden", moderatedBy: admin.userId, moderatedAt: now, pinned: false, featuredAt: null },
      });
      await auditAdminAction(admin.userId, "review.hidden", id, { before: { status: review.status }, after: { status: "hidden" }, reason, ip });
      return NextResponse.json({ review: updated });
    }
    case "unhide": {
      if (review.status !== "hidden") return NextResponse.json({ error: "Review is not hidden" }, { status: 409 });
      const updated = await prisma.review.update({
        where: { id },
        data: { status: "pending", moderatedBy: admin.userId, moderatedAt: now },
      });
      await auditAdminAction(admin.userId, "review.unhidden", id, { before: { status: "hidden" }, after: { status: "pending" }, reason, ip });
      return NextResponse.json({ review: updated });
    }
    case "pin": {
      if (review.status !== "published") return NextResponse.json({ error: "Only published reviews can be featured" }, { status: 409 });
      const updated = await prisma.review.update({ where: { id }, data: { pinned: true, featuredAt: now } });
      await auditAdminAction(admin.userId, "review.pinned", id, { reason, ip });
      return NextResponse.json({ review: updated });
    }
    case "unpin": {
      const updated = await prisma.review.update({ where: { id }, data: { pinned: false, featuredAt: null } });
      await auditAdminAction(admin.userId, "review.unpinned", id, { reason, ip });
      return NextResponse.json({ review: updated });
    }
  }
});
