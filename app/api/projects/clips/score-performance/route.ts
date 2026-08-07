import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/projects/clips/score-performance
//
// "Clips we scored 80+ averaged N× the views of clips under 50 — from your own
// posted clips."
//
// The loop that makes this possible already exists end to end: virality score →
// ClipPublish → Social Tracker metrics → lib/virality-calibration.ts, which
// recalibrates the scoring weights from real engagement. No competitor
// documents that loop, it gets stronger with usage while a hand-tuned score
// does not, and it has been completely invisible in the product.
//
// Deliberately computed from the user's OWN published clips. A global average
// would be a marketing claim; their own numbers are evidence.

const HIGH_SCORE = 80;
const LOW_SCORE = 50;
const MIN_SAMPLE = 3;

interface Bucket { count: number; totalViews: number }

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const publishes = await prisma.clipPublish.findMany({
    where: {
      status: "linked",
      clip: { project: { userId: auth.userId } },
      metricsJson: { not: Prisma.JsonNull },
    },
    select: { metricsJson: true, clip: { select: { score: true } } },
    take: 500,
  });

  const high: Bucket = { count: 0, totalViews: 0 };
  const low: Bucket = { count: 0, totalViews: 0 };

  for (const p of publishes) {
    const score = p.clip.score;
    if (score == null) continue;
    const views = Number((p.metricsJson as { views?: unknown } | null)?.views ?? 0);
    if (!Number.isFinite(views) || views <= 0) continue;

    if (score >= HIGH_SCORE) { high.count++; high.totalViews += views; }
    else if (score < LOW_SCORE) { low.count++; low.totalViews += views; }
  }

  // Below a handful of samples in each bucket the ratio is noise, and
  // presenting noise as insight is worse than saying "not yet".
  if (high.count < MIN_SAMPLE || low.count < MIN_SAMPLE) {
    return NextResponse.json({
      ready: false,
      needed: MIN_SAMPLE,
      have: { high: high.count, low: low.count },
    });
  }

  const highAvg = high.totalViews / high.count;
  const lowAvg = low.totalViews / low.count;

  return NextResponse.json({
    ready: true,
    highAvgViews: Math.round(highAvg),
    lowAvgViews: Math.round(lowAvg),
    multiple: Math.round((highAvg / Math.max(1, lowAvg)) * 10) / 10,
    sample: { high: high.count, low: low.count },
    thresholds: { high: HIGH_SCORE, low: LOW_SCORE },
  });
}

export const GET = withRateLimit(handleGET, {
  limit: 30, windowSec: 60, keyBy: "user", name: "auto-clip:score-performance",
});
