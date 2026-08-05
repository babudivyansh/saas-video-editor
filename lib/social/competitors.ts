// Competitor tracking orchestration: CRUD + scheduled snapshot refresh.
// Vendor calls go through competitor-source.ts (budget-capped); everything
// stored is public profile data only.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  BudgetExhaustedError, COMPETITOR_PROVIDERS, fetchPublicProfile, fetchRecentPublicPosts, isConfigured,
  type CompetitorProvider, type PublicPost,
} from "./competitor-source";

// Per-user slot cap — a plan-tier lever later; one sane number for now.
export const MAX_COMPETITORS = 3;

export { isConfigured as competitorTrackingConfigured };

interface EngagementStats {
  postsCount: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  engagementRate: number | null;
  postsPerWeek: number | null;
}

// Competitor engagement rate is (avg likes + avg comments) / followers — not
// lib/social/metrics/posts.ts's postEngagementRate (interactions / reach),
// which owned-account posts use. Reach/views aren't public data, so
// follower count is the only denominator a third-party vendor can ever
// supply here; this is the standard definition competitor-analytics tools
// use for exactly that reason.
// Exported for tests.
export function computeEngagementStats(posts: PublicPost[], followers: number | null): EngagementStats {
  const likes = posts.map((p) => p.likes).filter((v): v is number => v !== null);
  const comments = posts.map((p) => p.comments).filter((v): v is number => v !== null);
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const avgLikes = avg(likes);
  const avgComments = avg(comments);

  const engagementRate =
    followers && followers > 0 && (avgLikes !== null || avgComments !== null)
      ? ((avgLikes ?? 0) + (avgComments ?? 0)) / followers * 100
      : null;

  const dates = posts
    .map((p) => (p.publishedAt ? new Date(p.publishedAt).getTime() : null))
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  let postsPerWeek: number | null = null;
  if (dates.length >= 2) {
    const spanDays = (Math.max(...dates) - Math.min(...dates)) / 86_400_000;
    if (spanDays > 0) postsPerWeek = (posts.length / spanDays) * 7;
  }

  return { postsCount: posts.length || null, avgLikes, avgComments, engagementRate, postsPerWeek };
}

// A second vendor call beyond fetchPublicProfile, so this doubles the
// monthly budget cost per competitor add/refresh. Deliberately isolated
// from the profile fetch's own error handling: a failure here (including
// hitting the budget on this specific call) degrades to "no post-level
// stats yet" rather than blocking the followers-tracking flow that already
// works today.
async function fetchEngagementStats(provider: CompetitorProvider, handle: string, followers: number | null): Promise<EngagementStats> {
  try {
    const posts = await fetchRecentPublicPosts(provider, handle);
    return computeEngagementStats(posts, followers);
  } catch (e) {
    logger.warn("social", `competitor posts fetch failed for ${provider}/${handle}`, { reason: (e as Error).message });
    return { postsCount: null, avgLikes: null, avgComments: null, engagementRate: null, postsPerWeek: null };
  }
}

export async function listCompetitors(userId: string) {
  return prisma.competitorProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, provider: true, handle: true, displayName: true, avatarUrl: true,
      followers: true, lastSyncedAt: true,
      snapshots: {
        orderBy: { capturedAt: "asc" },
        take: 60,
        select: { capturedAt: true, followers: true },
      },
    },
  });
}

export async function addCompetitor(
  userId: string,
  provider: string,
  handle: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  if (!isConfigured()) return { ok: false, error: "Competitor tracking is not enabled on this deployment.", status: 503 };
  if (!COMPETITOR_PROVIDERS.includes(provider as CompetitorProvider)) {
    return { ok: false, error: "Unsupported platform for competitor tracking.", status: 400 };
  }
  const cleaned = handle.trim().replace(/^@/, "");
  if (!/^[\w.\-]{2,60}$/.test(cleaned)) return { ok: false, error: "That doesn't look like a valid handle.", status: 400 };

  const count = await prisma.competitorProfile.count({ where: { userId } });
  if (count >= MAX_COMPETITORS) {
    return { ok: false, error: `You can track up to ${MAX_COMPETITORS} competitors.`, status: 409 };
  }

  let profile;
  try {
    profile = await fetchPublicProfile(provider as CompetitorProvider, cleaned);
  } catch (e) {
    if (e instanceof BudgetExhaustedError) {
      return { ok: false, error: "Competitor data budget for this month is used up — try next month.", status: 429 };
    }
    return { ok: false, error: "Couldn't find that profile. Check the handle and platform.", status: 404 };
  }

  const row = await prisma.competitorProfile.upsert({
    where: { userId_provider_handle: { userId, provider, handle: cleaned } },
    create: {
      userId, provider, handle: cleaned,
      displayName: profile.displayName, avatarUrl: profile.avatarUrl,
      followers: profile.followers, lastSyncedAt: new Date(),
    },
    update: {
      displayName: profile.displayName, avatarUrl: profile.avatarUrl,
      followers: profile.followers, lastSyncedAt: new Date(),
    },
  });
  const engagement = await fetchEngagementStats(provider as CompetitorProvider, cleaned, profile.followers);
  await prisma.competitorSnapshot.create({ data: { competitorId: row.id, followers: profile.followers, ...engagement } });
  return { ok: true, id: row.id };
}

export async function removeCompetitor(userId: string, id: string): Promise<boolean> {
  const row = await prisma.competitorProfile.findFirst({ where: { id, userId }, select: { id: true } });
  if (!row) return false;
  await prisma.competitorProfile.delete({ where: { id } });
  return true;
}

// Refresh competitor followers at most daily — piggybacks on the refresh cron.
// Budget exhaustion stops the loop quietly; it resets next month.
export async function refreshStaleCompetitors(maxAgeHours = 24, limit = 30): Promise<{ refreshed: number }> {
  if (!isConfigured()) return { refreshed: 0 };
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
  const stale = await prisma.competitorProfile.findMany({
    where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let refreshed = 0;
  for (const c of stale) {
    try {
      const profile = await fetchPublicProfile(c.provider as CompetitorProvider, c.handle);
      await prisma.competitorProfile.update({
        where: { id: c.id },
        data: {
          displayName: profile.displayName ?? c.displayName,
          avatarUrl: profile.avatarUrl ?? c.avatarUrl,
          followers: profile.followers ?? c.followers,
          lastSyncedAt: new Date(),
        },
      });
      const engagement = await fetchEngagementStats(c.provider as CompetitorProvider, c.handle, profile.followers ?? c.followers);
      await prisma.competitorSnapshot.create({ data: { competitorId: c.id, followers: profile.followers, ...engagement } });
      refreshed++;
    } catch (e) {
      if (e instanceof BudgetExhaustedError) break;
      logger.warn("social", `competitor refresh failed for ${c.id}`, { reason: (e as Error).message });
    }
  }
  return { refreshed };
}
