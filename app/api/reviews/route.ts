import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { isEligibleToSubmit, computeVerifiedCustomer } from "@/lib/reviews/eligibility";
import { submitReviewSchema, reviewListQuerySchema } from "@/lib/reviews/schemas";
import { listPublishedReviews, getReviewSummary } from "@/lib/reviews/queries";
import { computeSpamScore, isDuplicateReviewBody } from "@/lib/reviews/spam";
import { getReviewSettings } from "@/lib/reviews/settings";
import { notifyAdmins } from "@/lib/notify";

async function handleGET(req: NextRequest) {
  const parsed = reviewListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const [{ items, nextCursor }, summary] = await Promise.all([
    listPublishedReviews(parsed.data),
    getReviewSummary(),
  ]);

  return NextResponse.json({ items, nextCursor, summary });
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eligibility = await isEligibleToSubmit(auth.userId);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: "You're not eligible to submit a review yet.", code: "not_eligible", reason: eligibility.reason },
      { status: 403 },
    );
  }

  const rawBody = await req.json().catch(() => null);
  // Honeypot: a hidden field real users never fill in. Stripped before
  // validation so .strict() below isn't broken by the extra key; a non-empty
  // value gets the same generic 400 as a real validation failure, so a bot
  // learns nothing from the response shape, and the write is silently
  // skipped rather than erroring loudly.
  const honeypotFilled = !!(rawBody && typeof rawBody === "object" && "hp" in rawBody && (rawBody as { hp?: unknown }).hp);
  if (rawBody && typeof rawBody === "object") delete (rawBody as { hp?: unknown }).hp;

  const parsed = submitReviewSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (honeypotFilled) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { verified, tier } = await computeVerifiedCustomer(auth.userId);

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { createdAt: true } });
  const accountAgeHours = user ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60) : 0;
  const isDuplicate = await isDuplicateReviewBody(parsed.data.body, auth.userId);
  const spam = computeSpamScore(parsed.data.body, { rating: parsed.data.rating, accountAgeHours }, isDuplicate);
  const settings = await getReviewSettings();
  const autoHidden = spam.score >= settings.spamScoreAutoHideThreshold;

  try {
    const review = await prisma.review.create({
      data: {
        userId: auth.userId,
        rating: parsed.data.rating,
        title: parsed.data.title,
        body: parsed.data.body,
        featureUsed: parsed.data.featureUsed,
        wouldRecommend: parsed.data.wouldRecommend,
        publicDisplayConsent: parsed.data.publicDisplayConsent,
        company: parsed.data.company,
        country: parsed.data.country,
        verifiedCustomer: verified,
        tierAtSubmit: tier,
        status: autoHidden ? "hidden" : "pending",
        spamScore: spam.score,
        spamFlags: spam.flags,
      },
    });
    if (autoHidden) {
      await notifyAdmins("admin_review_spam_detected", "A new review was auto-hidden for spam", `Spam score ${spam.score}`, `/admin/reviews/${review.id}`);
    } else {
      await notifyAdmins("admin_review_new", "New review submitted", undefined, `/admin/reviews/${review.id}`);
    }
    // Attribute this submission to whichever prompt-funnel event/email-drip
    // sequence is still open for this user (see lib/reviews/prompt-triggers.ts —
    // at most one of each is normally open at a time), and stop the drip.
    await Promise.all([
      prisma.reviewPromptEvent.updateMany({
        where: { userId: auth.userId, convertedAt: null },
        data: { convertedAt: new Date(), reviewId: review.id },
      }),
      prisma.reviewEmailSequence.updateMany({
        where: { userId: auth.userId, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelReason: "reviewed" },
      }),
    ]);
    return NextResponse.json({ review }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "You've already submitted a review." }, { status: 409 });
    }
    throw e;
  }
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "ip", name: "reviews:list" });
export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 86400, keyBy: "user", name: "reviews:submit" });
