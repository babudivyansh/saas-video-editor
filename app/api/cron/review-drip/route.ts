import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getReviewSettings } from "@/lib/reviews/settings";
import { shouldSendCategory } from "@/lib/notifications";
import { sendReviewDripEmail1, sendReviewDripEmail2, sendReviewDripEmail3 } from "@/lib/email";
import { logger } from "@/lib/logger";

//   GET /api/cron/review-drip
//   Authorization: Bearer <CRON_SECRET>
//
// Daily. Scans ReviewEmailSequence (one row per user, started by
// lib/reviews/prompt-triggers.ts's recordPrompt for every non-days_active
// trigger) for whichever of the 3 drip stages is next due, per the admin-
// tunable delays in lib/reviews/settings.ts. A user gets at most 3 emails,
// ever, and the sequence stops immediately once a review is submitted
// (proactively cancelled by POST /api/reviews) or the user opts out.
const REVIEW_URL = "https://clipiro.com/dashboard?prompt=1";

type Stage = 1 | 2 | 3;

interface DueRow {
  userId: string;
}

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const settings = await getReviewSettings();

  const cutoff1 = new Date(now.getTime() - settings.emailDrip1DelayHours * 60 * 60 * 1000);
  const cutoff2 = new Date(now.getTime() - settings.emailDrip2DelayDays * 86400_000);
  const cutoff3 = new Date(now.getTime() - settings.emailDrip3DelayDays * 86400_000);

  const [stage1Due, stage2Due, stage3Due] = await Promise.all([
    prisma.reviewEmailSequence.findMany({
      where: { cancelledAt: null, email1SentAt: null, triggerEventAt: { lte: cutoff1 } },
      select: { userId: true },
    }),
    prisma.reviewEmailSequence.findMany({
      where: { cancelledAt: null, email1SentAt: { not: null, lte: cutoff2 }, email2SentAt: null },
      select: { userId: true },
    }),
    prisma.reviewEmailSequence.findMany({
      where: { cancelledAt: null, email2SentAt: { not: null, lte: cutoff3 }, email3SentAt: null },
      select: { userId: true },
    }),
  ]);

  let sent = 0;
  let cancelled = 0;
  let errors = 0;

  async function processStage(rows: DueRow[], stage: Stage) {
    for (const row of rows) {
      try {
        // A review may have landed between the proactive cancel-on-submit
        // write and this scan — check again here as a belt-and-suspenders
        // guard against a genuinely missed cancellation.
        const existingReview = await prisma.review.findUnique({ where: { userId: row.userId }, select: { id: true } });
        if (existingReview) {
          await prisma.reviewEmailSequence.updateMany({
            where: { userId: row.userId, cancelledAt: null },
            data: { cancelledAt: new Date(), cancelReason: "reviewed" },
          });
          cancelled++;
          continue;
        }

        if (!(await shouldSendCategory(row.userId, "reviewPrompts"))) {
          // Opted out — stop the whole sequence rather than re-checking on
          // every future run.
          await prisma.reviewEmailSequence.updateMany({
            where: { userId: row.userId, cancelledAt: null },
            data: { cancelledAt: new Date(), cancelReason: "opted_out" },
          });
          cancelled++;
          continue;
        }

        const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { email: true, firstName: true, name: true } });
        if (!user) continue;
        const name = user.name || user.firstName || "";

        if (stage === 1) {
          await sendReviewDripEmail1(user.email, name, row.userId, REVIEW_URL);
          await prisma.reviewEmailSequence.update({ where: { userId: row.userId }, data: { email1SentAt: new Date() } });
        } else if (stage === 2) {
          await sendReviewDripEmail2(user.email, name, row.userId, REVIEW_URL);
          await prisma.reviewEmailSequence.update({ where: { userId: row.userId }, data: { email2SentAt: new Date() } });
        } else {
          await sendReviewDripEmail3(user.email, name, row.userId, REVIEW_URL);
          await prisma.reviewEmailSequence.update({ where: { userId: row.userId }, data: { email3SentAt: new Date() } });
        }
        sent++;
      } catch (e) {
        errors++;
        logger.error("review-drip", `stage ${stage} failed for user ${row.userId}`, e);
      }
    }
  }

  await processStage(stage1Due, 1);
  await processStage(stage2Due, 2);
  await processStage(stage3Due, 3);

  return NextResponse.json({
    ok: true,
    candidates: stage1Due.length + stage2Due.length + stage3Due.length,
    sent,
    cancelled,
    errors,
  });
}
