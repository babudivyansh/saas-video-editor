import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getReviewSettings } from "@/lib/reviews/settings";
import { notifyAdmins } from "@/lib/notify";

const reportSchema = z
  .object({
    reason: z.enum(["spam", "offensive", "fake", "off_topic", "other"]),
    details: z.string().trim().max(500).optional(),
  })
  .strict();

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const review = await prisma.review.findFirst({ where: { id, status: "published" } });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.userId === auth.userId) return NextResponse.json({ error: "You cannot report your own review" }, { status: 403 });

  try {
    await prisma.reviewReport.create({
      data: { reviewId: id, userId: auth.userId, reason: parsed.data.reason, details: parsed.data.details },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "You've already reported this review." }, { status: 409 });
    }
    throw e;
  }

  const settings = await getReviewSettings();
  const updated = await prisma.review.update({
    where: { id },
    data: { reportCount: { increment: 1 } },
    select: { reportCount: true, status: true },
  });

  if (updated.reportCount >= settings.autoHideReportThreshold && updated.status === "published") {
    await prisma.review.update({ where: { id }, data: { status: "hidden" } });
    await notifyAdmins("admin_review_reported", "A review was auto-hidden after multiple reports", `${updated.reportCount} reports`, `/admin/reviews/${id}`);
  }

  return NextResponse.json({ success: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 86400, keyBy: "user", name: "reviews:report" });
