import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { isEligibleToSubmit } from "@/lib/reviews/eligibility";
import { editReviewSchema } from "@/lib/reviews/schemas";
import { computeSpamScore, isDuplicateReviewBody } from "@/lib/reviews/spam";
import { getReviewSettings } from "@/lib/reviews/settings";
import { deleteS3Object, getAssetReadUrl } from "@/utils/s3-upload";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const review = await prisma.review.findUnique({
    where: { userId: auth.userId },
    include: { attachments: { orderBy: { createdAt: "asc" } } },
  });
  if (!review) {
    const eligibility = await isEligibleToSubmit(auth.userId);
    return NextResponse.json({ review: null, eligibility });
  }
  const attachments = await Promise.all(
    review.attachments.map(async (a) => ({ id: a.id, kind: a.kind, moderationStatus: a.moderationStatus, url: await getAssetReadUrl(a.s3Key) })),
  );
  return NextResponse.json({ review: { ...review, attachments }, eligibility: null });
}

async function handlePATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.review.findUnique({ where: { userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = editReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Any edit to a published review re-queues it for moderation — a review
  // that's live must have been seen by an admin in its current form.
  const wasPublished = existing.status === "published";

  const effectiveBody = parsed.data.body ?? existing.body;
  const effectiveRating = parsed.data.rating ?? existing.rating;
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { createdAt: true } });
  const accountAgeHours = user ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60) : 0;
  const isDuplicate = await isDuplicateReviewBody(effectiveBody, auth.userId);
  const spam = computeSpamScore(effectiveBody, { rating: effectiveRating, accountAgeHours }, isDuplicate);
  const settings = await getReviewSettings();
  const autoHidden = spam.score >= settings.spamScoreAutoHideThreshold;

  const review = await prisma.review.update({
    where: { userId: auth.userId },
    data: {
      ...parsed.data,
      spamScore: spam.score,
      spamFlags: spam.flags,
      ...(autoHidden
        ? { status: "hidden" }
        : wasPublished
          ? { status: "pending", editedAt: new Date() }
          : {}),
    },
  });
  return NextResponse.json({ review });
}

async function handleDELETE(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.review.findUnique({ where: { userId: auth.userId }, include: { attachments: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The DB rows cascade automatically (ReviewAttachment.review onDelete:
  // Cascade), but the underlying S3 objects don't — clean those up too.
  await Promise.all(
    existing.attachments.flatMap((a) => [
      deleteS3Object(a.s3Key).catch(() => {}),
      a.thumbnailS3Key ? deleteS3Object(a.thumbnailS3Key).catch(() => {}) : Promise.resolve(),
    ]),
  );

  await prisma.review.delete({ where: { userId: auth.userId } });
  return NextResponse.json({ success: true });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 5, windowSec: 3600, keyBy: "user", name: "reviews:edit" });
export const DELETE = withRateLimit(handleDELETE, { limit: 5, windowSec: 3600, keyBy: "user", name: "reviews:delete" });
