// Social publish + analytics loop (AutoClip P2.5).
//
// IMPORTANT SCOPE NOTE: actually pushing new video content to a user's live
// YouTube/Instagram/Facebook account requires write-scope OAuth grants this
// app doesn't request today — SocialAccount is documented as "Read-only
// analytics scopes only" (prisma/schema.prisma) — plus platform app review
// (Instagram Content Publishing in particular requires Meta business
// verification). Silently expanding OAuth scopes or claiming to auto-publish
// without that in place would be misleading and would break every already-
// connected account until re-auth. So this module implements the safer,
// still-valuable v1: the user publishes manually on the platform themselves,
// then pastes the live permalink back here — closing the analytics loop
// (via the existing Social Tracker sync) without requiring new OAuth scopes
// or review. True one-click auto-publish is a distinct follow-up decision.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

function extractYouTubeId(url: string): string | null {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}

// Only YouTube permalinks map to a provider post id without extra API calls.
// Instagram/Facebook stay linked-but-unmetriced until per-provider resolution
// is built out — the permalink is still stored for reference either way.
export function providerPostIdFromPermalink(provider: string, permalink: string): string | null {
  if (provider === "youtube") return extractYouTubeId(permalink);
  return null;
}

export async function refreshClipPublishMetrics(limit = 200): Promise<{ updated: number }> {
  const publishes = await prisma.clipPublish.findMany({
    where: { status: "linked", providerPostId: { not: null } },
    take: limit,
  });

  let updated = 0;
  for (const p of publishes) {
    try {
      const post = await prisma.socialPost.findUnique({
        where: { accountId_providerPostId: { accountId: p.socialAccountId, providerPostId: p.providerPostId! } },
      });
      if (!post) continue;
      await prisma.clipPublish.update({
        where: { id: p.id },
        data: {
          metricsJson: {
            views: post.views, likes: post.likes, comments: post.comments,
            shares: post.shares, saves: post.saves, reach: post.reach, watchTimeSec: post.watchTimeSec,
          },
        },
      });
      updated++;
    } catch (e) {
      logger.error("autoclip-publish", `failed to refresh metrics for ClipPublish ${p.id}`, e);
    }
  }
  return { updated };
}
