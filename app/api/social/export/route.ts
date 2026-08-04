import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertOwnedAccount, parseQuery, withSocial } from "@/lib/social/api";
import { csvBody, csvFilename, type CsvRow } from "@/lib/social/csv";
import { exportKindSchema, accountIdSchema } from "@/lib/social/schemas";
import { loadAudience } from "@/lib/social/queries";

// GET /api/social/export?accountId=…&kind=posts|snapshots|daily|audience|competitors
//
// CSV download of an account's raw tracked data. Doubles as data portability,
// which is why it exports what we hold rather than what the dashboard shows.
//
// Now goes through lib/social/csv: the previous hand-rolled escaper quoted
// commas but did nothing about a leading =, +, - or @, so a post caption
// starting with "=" executed as a formula when the file was opened. Captions
// are attacker-chosen text.
const POST_LIMIT = 5_000;
const SNAPSHOT_LIMIT = 5_000;
const DAILY_LIMIT = 2_000;
const AUDIENCE_WINDOW_DAYS = 400;

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({
    accountId: accountIdSchema,
    kind: exportKindSchema.default("posts"),
  }));
  const account = await assertOwnedAccount(auth.userId, q.accountId);

  const { header, rows } = await buildExport(q.accountId, account.userId, q.kind);

  return new NextResponse(csvBody(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename([account.provider, account.username, q.kind])}"`,
      // A data export is per-user by definition and must never be held by an
      // intermediary cache.
      "Cache-Control": "private, no-store",
    },
  });
}, {
  // Deliberately tighter than the read routes: these are large scans, and a
  // download loop is a cheap way to make the database do a lot of work.
  rateLimit: { key: (auth) => `social:export:${auth.userId}`, max: 10, windowSec: 300 },
});

async function buildExport(
  accountId: string,
  userId: string,
  kind: z.infer<typeof exportKindSchema>,
): Promise<{ header: string[]; rows: CsvRow[] }> {
  if (kind === "posts") {
    const posts = await prisma.socialPost.findMany({
      where: { accountId },
      orderBy: { publishedAt: "desc" },
      take: POST_LIMIT,
    });
    return {
      header: [
        "publishedAt", "mediaType", "caption", "views", "likes", "comments", "shares",
        "saves", "reach", "impressions", "watchTimeSec", "avgViewPercentage", "viralScore", "permalink",
      ],
      rows: posts.map((p) => [
        p.publishedAt?.toISOString(), p.mediaType, p.caption, p.views, p.likes, p.comments,
        p.shares, p.saves, p.reach, p.impressions, p.watchTimeSec, p.avgViewPercentage,
        p.viralScore, p.permalink,
      ]),
    };
  }

  if (kind === "snapshots") {
    const snapshots = await prisma.socialAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { capturedAt: "asc" },
      take: SNAPSHOT_LIMIT,
    });
    return {
      header: ["capturedAt", "followers", "views", "impressions", "reach", "engagement"],
      rows: snapshots.map((s) => [
        s.capturedAt.toISOString(), s.followers, s.views, s.impressions, s.reach, s.engagement,
      ]),
    };
  }

  if (kind === "daily") {
    const daily = await prisma.socialDailyMetric.findMany({
      where: { accountId },
      orderBy: { date: "asc" },
      take: DAILY_LIMIT,
    });
    return {
      header: [
        "date", "impressions", "reach", "views", "plays", "followers", "followersGained",
        "followersLost", "profileViews", "websiteClicks", "likes", "comments", "shares",
        "saves", "totalInteractions", "watchTimeSec", "avgViewDurationSec", "avgViewPercentage",
        "ctr", "postsPublished",
      ],
      rows: daily.map((d) => [
        d.date.toISOString().slice(0, 10), d.impressions, d.reach, d.views, d.plays, d.followers,
        d.followersGained, d.followersLost, d.profileViews, d.websiteClicks, d.likes, d.comments,
        d.shares, d.saves, d.totalInteractions, d.watchTimeSec, d.avgViewDurationSec,
        d.avgViewPercentage, d.ctr, d.postsPublished,
      ]),
    };
  }

  if (kind === "audience") {
    const audience = await loadAudience(
      accountId,
      new Date(Date.now() - AUDIENCE_WINDOW_DAYS * 86_400_000),
    );
    return {
      header: ["audience", "dimension", "bucket", "value", "unit"],
      rows: audience.rows.map((r) => [r.audience, r.dimension, r.bucket, r.value, r.unit]),
    };
  }

  // competitors: user-scoped rather than account-scoped, but exported through
  // the same surface so there is one download endpoint rather than two. Scoped
  // by the OWNER of the asserted account, never by a userId from the request.
  const competitors = await prisma.competitorProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      provider: true, handle: true, displayName: true, followers: true, lastSyncedAt: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { engagementRate: true, postsPerWeek: true, avgLikes: true, avgComments: true },
      },
    },
  });
  return {
    header: [
      "provider", "handle", "displayName", "followers", "engagementRate",
      "postsPerWeek", "avgLikes", "avgComments", "lastSyncedAt",
    ],
    rows: competitors.map((c) => [
      c.provider, c.handle, c.displayName, c.followers, c.snapshots[0]?.engagementRate,
      c.snapshots[0]?.postsPerWeek, c.snapshots[0]?.avgLikes, c.snapshots[0]?.avgComments,
      c.lastSyncedAt?.toISOString(),
    ]),
  };
}
