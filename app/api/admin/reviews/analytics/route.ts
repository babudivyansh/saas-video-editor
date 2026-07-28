import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { metricsQuerySchema } from "@/lib/admin/schemas";
import { FEATURE_USED_OPTIONS } from "@/lib/reviews/constants";

// Buckets a list of {createdAt, ...} rows by UTC day into a dense series
// covering every day in [since, now] — days with no rows still appear with
// a zero/empty bucket, so charts don't show misleading gaps as flat lines.
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function denseDayRange(since: Date, now: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (cursor <= end) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// GET /api/admin/reviews/analytics?range=7|30|90|365
// One composed payload per range pill — everything the reviews analytics
// dashboard needs in a single round trip. Rating/feature/sentiment metrics
// deliberately include every status (not just published) — this is an
// internal "how are people actually rating us" view, not the public tally.
export const GET = withAdmin(async (req) => {
  const { range } = parseQuery(req, metricsQuerySchema.pick({ range: true }));
  const now = new Date();
  const since = new Date(now.getTime() - range * 86400_000);

  const [
    reviewsInRange,
    ratingGrouped,
    featureGrouped,
    votesInRange,
    eligibleUsers,
    reviewsSubmitted,
    activeSubscriberReviews,
    churnedReviews,
    openReportsCount,
  ] = await Promise.all([
    prisma.review.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, rating: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.review.groupBy({
      by: ["featureUsed"],
      where: { createdAt: { gte: since } },
      _count: true,
      _avg: { rating: true },
    }),
    prisma.reviewHelpfulVote.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, value: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.count({ where: { firstVideoAt: { gte: since } } }),
    prisma.review.count({ where: { createdAt: { gte: since } } }),
    prisma.review.findMany({
      where: { createdAt: { gte: since }, user: { subscriptionEndsAt: { gt: now } } },
      select: { rating: true },
    }),
    prisma.review.findMany({
      where: {
        createdAt: { gte: since },
        user: {
          OR: [
            { subscriptionCancelledAt: { not: null } },
            { AND: [{ planId: { not: null } }, { subscriptionEndsAt: { lte: now } }] },
          ],
        },
      },
      select: { rating: true },
    }),
    prisma.reviewReport.count({ where: { status: "open" } }),
  ]);

  const [promptEventsInRange, emailSequencesInRange, impressionRows] = await Promise.all([
    prisma.reviewPromptEvent.findMany({
      where: { shownAt: { gte: since } },
      select: { trigger: true, dismissedAt: true, permanentDismiss: true, convertedAt: true },
    }),
    prisma.reviewEmailSequence.findMany({
      where: { createdAt: { gte: since } },
      select: {
        email1SentAt: true, email1OpenedAt: true, email1ClickedAt: true,
        email2SentAt: true, email2OpenedAt: true, email2ClickedAt: true,
        email3SentAt: true, email3OpenedAt: true, email3ClickedAt: true,
        cancelledAt: true, cancelReason: true,
      },
    }),
    prisma.testimonialImpression.findMany({ where: { date: { gte: dayKey(since) } } }),
  ]);

  // Dense day series for the two trend charts.
  const days = denseDayRange(since, now);
  const submissionsByDay = new Map(days.map((d) => [d, 0]));
  const ratingSumByDay = new Map(days.map((d) => [d, { sum: 0, count: 0 }]));
  for (const r of reviewsInRange) {
    const key = dayKey(r.createdAt);
    submissionsByDay.set(key, (submissionsByDay.get(key) ?? 0) + 1);
    const bucket = ratingSumByDay.get(key);
    if (bucket) { bucket.sum += r.rating; bucket.count += 1; }
  }
  const submissionsOverTime = days.map((date) => ({ date, count: submissionsByDay.get(date) ?? 0 }));
  const avgRatingTrend = days.map((date) => {
    const b = ratingSumByDay.get(date)!;
    return { date, avg: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : 0 };
  });

  const helpfulByDay = new Map(days.map((d) => [d, { helpful: 0, notHelpful: 0 }]));
  for (const v of votesInRange) {
    const bucket = helpfulByDay.get(dayKey(v.createdAt));
    if (bucket) { if (v.value === 1) bucket.helpful += 1; else bucket.notHelpful += 1; }
  }
  const helpfulVoteTrend = days.map((date) => ({ date, ...helpfulByDay.get(date)! }));

  const ratingDistribution = ([1, 2, 3, 4, 5] as const).map((rating) => ({
    rating,
    count: ratingGrouped.find((g) => g.rating === rating)?._count ?? 0,
  }));

  const featureStats = FEATURE_USED_OPTIONS.map((opt) => {
    const g = featureGrouped.find((f) => f.featureUsed === opt.value);
    return { featureUsed: opt.value, count: g?._count ?? 0, avgRating: g?._avg.rating ? Math.round(g._avg.rating * 10) / 10 : 0 };
  }).filter((f) => f.count > 0);

  const positive = ratingGrouped.filter((g) => g.rating >= 4).reduce((s, g) => s + g._count, 0);
  const neutral = ratingGrouped.find((g) => g.rating === 3)?._count ?? 0;
  const negative = ratingGrouped.filter((g) => g.rating <= 2).reduce((s, g) => s + g._count, 0);

  const avg = (rows: { rating: number }[]) => (rows.length > 0 ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : 0);

  // Prompt funnel — per-trigger shown/dismissed/converted, from the
  // append-only ReviewPromptEvent log (distinct from ReviewPromptState,
  // which only owns the throttle decision, not analytics).
  const promptFunnelMap = new Map<string, { shown: number; dismissed: number; permanentDismiss: number; converted: number }>();
  for (const e of promptEventsInRange) {
    const bucket = promptFunnelMap.get(e.trigger) ?? { shown: 0, dismissed: 0, permanentDismiss: 0, converted: 0 };
    bucket.shown += 1;
    if (e.dismissedAt) bucket.dismissed += 1;
    if (e.permanentDismiss) bucket.permanentDismiss += 1;
    if (e.convertedAt) bucket.converted += 1;
    promptFunnelMap.set(e.trigger, bucket);
  }
  const promptFunnel = Array.from(promptFunnelMap.entries())
    .map(([trigger, b]) => ({
      trigger,
      shown: b.shown,
      dismissed: b.dismissed,
      permanentDismiss: b.permanentDismiss,
      converted: b.converted,
      dismissalRate: b.shown > 0 ? Math.round((b.dismissed / b.shown) * 1000) / 10 : 0,
      conversionRate: b.shown > 0 ? Math.round((b.converted / b.shown) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.shown - a.shown);

  // Email drip funnel — per-stage sent/opened/clicked, plus why sequences
  // stopped (reviewed vs. opted out), from ReviewEmailSequence.
  const dripStage = (sent: number, opened: number, clicked: number) => ({
    sent,
    opened,
    clicked,
    openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
    clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
  });
  let email1Sent = 0, email1Opened = 0, email1Clicked = 0;
  let email2Sent = 0, email2Opened = 0, email2Clicked = 0;
  let email3Sent = 0, email3Opened = 0, email3Clicked = 0;
  let cancelledReviewed = 0, cancelledOptedOut = 0;
  for (const s of emailSequencesInRange) {
    if (s.email1SentAt) { email1Sent++; if (s.email1OpenedAt) email1Opened++; if (s.email1ClickedAt) email1Clicked++; }
    if (s.email2SentAt) { email2Sent++; if (s.email2OpenedAt) email2Opened++; if (s.email2ClickedAt) email2Clicked++; }
    if (s.email3SentAt) { email3Sent++; if (s.email3OpenedAt) email3Opened++; if (s.email3ClickedAt) email3Clicked++; }
    if (s.cancelReason === "reviewed") cancelledReviewed++;
    if (s.cancelReason === "opted_out") cancelledOptedOut++;
  }
  const emailDripStats = {
    stage1: dripStage(email1Sent, email1Opened, email1Clicked),
    stage2: dripStage(email2Sent, email2Opened, email2Clicked),
    stage3: dripStage(email3Sent, email3Opened, email3Clicked),
    cancelledReviewed,
    cancelledOptedOut,
    totalSequences: emailSequencesInRange.length,
  };

  // Landing-page testimonial engagement — a real, if coarse, anonymous
  // impression count. Deliberately NOT a testimonial-specific conversion
  // metric (see conversionRate above) — that would need session-linking an
  // anonymous visit to a later signup, a materially bigger investment.
  const impressionByDay = new Map(days.map((d) => [d, 0]));
  for (const row of impressionRows) {
    if (impressionByDay.has(row.date)) impressionByDay.set(row.date, row.count);
  }
  const testimonialImpressions = days.map((date) => ({ date, count: impressionByDay.get(date) ?? 0 }));

  return NextResponse.json({
    range,
    totalReviews: reviewsInRange.length,
    openReportsCount,
    submissionsOverTime,
    avgRatingTrend,
    ratingDistribution,
    mostReviewedFeatures: [...featureStats].sort((a, b) => b.count - a.count),
    // Same data as featureSatisfaction below, surfaced under a second,
    // more marketing-friendly key — not a new data source.
    mostLovedFeatures: [...featureStats].sort((a, b) => b.avgRating - a.avgRating),
    sentiment: { positive, neutral, negative },
    conversionRate: {
      eligibleUsers,
      reviewsSubmitted,
      rate: eligibleUsers > 0 ? Math.round((reviewsSubmitted / eligibleUsers) * 1000) / 10 : 0,
    },
    helpfulVoteTrend,
    featureSatisfaction: [...featureStats].sort((a, b) => b.avgRating - a.avgRating),
    churnCorrelation: {
      avgRatingChurned: avg(churnedReviews),
      avgRatingRetained: avg(activeSubscriberReviews),
      sampleSizeChurned: churnedReviews.length,
      sampleSizeRetained: activeSubscriberReviews.length,
    },
    promptFunnel,
    emailDripStats,
    testimonialImpressions,
  });
});
