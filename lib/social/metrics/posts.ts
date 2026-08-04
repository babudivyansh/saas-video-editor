// Per-post derivations. Pure.

import { mean } from "./series";
import type { PostRow } from "./types";

/**
 * Engagement rate as a percentage of the audience that actually saw the post.
 *
 * Reach is the honest denominator where the platform provides it (IG/FB); views
 * is the video-platform stand-in (YouTube). A post with neither cannot have a
 * rate, and returns null rather than a fabricated zero.
 */
export function postEngagementRate(p: PostRow): number | null {
  const interactions = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
  const denominator = Math.max(p.reach ?? 0, p.views ?? 0);
  if (denominator <= 0) return null;
  return (interactions / denominator) * 100;
}

/** Total interactions, ignoring which of them the provider reported. */
export function postInteractions(p: PostRow): number {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
}

/** Shares as a share of audience — the strongest single virality signal. */
export function postShareRate(p: PostRow): number | null {
  const denominator = Math.max(p.reach ?? 0, p.views ?? 0);
  if (denominator <= 0 || p.shares == null) return null;
  return (p.shares / denominator) * 100;
}

/** The audience figure to rank a post by: reach where known, else views. */
export function postAudience(p: PostRow): number | null {
  const value = Math.max(p.reach ?? 0, p.views ?? 0);
  return value > 0 ? value : null;
}

/** Posts sorted by audience, largest first. Does not mutate the input. */
export function rankByAudience<T extends PostRow>(posts: T[]): T[] {
  return [...posts].sort((a, b) => (postAudience(b) ?? 0) - (postAudience(a) ?? 0));
}

export interface ContentTypeBreakdown {
  type: string;
  count: number;
  avgEngagementRate: number | null;
}

/** Post mix by media type, most frequent first. */
export function contentTypeBreakdown(posts: PostRow[]): ContentTypeBreakdown[] {
  const byType = new Map<string, PostRow[]>();
  for (const p of posts) {
    const type = p.mediaType || "other";
    const bucket = byType.get(type);
    if (bucket) bucket.push(p);
    else byType.set(type, [p]);
  }
  return [...byType.entries()]
    .map(([type, group]) => ({
      type,
      count: group.length,
      avgEngagementRate: mean(group.map(postEngagementRate).filter((v): v is number => v !== null)),
    }))
    .sort((a, b) => b.count - a.count);
}
