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

// Case-insensitive host, no query/hash, no trailing slash — the same post's
// permalink can arrive in several equivalent spellings (share sheets add
// ?igsh=… etc.) and must still compare equal.
export function normalizePermalink(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

// YouTube and TikTok permalinks encode the provider post id (the video id).
export function providerPostIdFromPermalink(provider: string, permalink: string): string | null {
  if (provider === "youtube") return extractYouTubeId(permalink);
  if (provider === "tiktok") {
    const m = /tiktok\.com\/@[\w.-]+\/video\/(\d+)/.exec(permalink);
    return m ? m[1] : null;
  }
  return null;
}

// Instagram/Facebook permalinks don't textually contain the Graph API media/post
// id, but the Social Tracker sync stores each post's canonical permalink — so a
// pasted link resolves by matching against the account's already-synced posts.
// Returns null when the post hasn't been synced yet; the ClipPublish keeps its
// permalink either way and can be re-resolved after the next sync.
export async function resolveProviderPostId(
  account: { id: string; provider: string },
  permalink: string,
): Promise<string | null> {
  const direct = providerPostIdFromPermalink(account.provider, permalink);
  if (direct) return direct;
  if (account.provider !== "instagram" && account.provider !== "facebook") return null;

  const wanted = normalizePermalink(permalink);
  if (!wanted) return null;
  const posts = await prisma.socialPost.findMany({
    where: { accountId: account.id, permalink: { not: null } },
    select: { providerPostId: true, permalink: true },
  });
  for (const p of posts) {
    if (p.permalink && normalizePermalink(p.permalink) === wanted) return p.providerPostId;
  }
  return null;
}

export async function refreshClipPublishMetrics(limit = 200): Promise<{ updated: number }> {
  const publishes = await prisma.clipPublish.findMany({
    where: { status: "linked", permalink: { not: null } },
    include: { socialAccount: { select: { id: true, provider: true } } },
    take: limit,
  });

  let updated = 0;
  for (const p of publishes) {
    try {
      // A Meta permalink pasted before its post was synced has no provider post
      // id yet — retry resolution now that newer syncs may have stored it.
      let providerPostId = p.providerPostId;
      if (!providerPostId) {
        providerPostId = await resolveProviderPostId(p.socialAccount, p.permalink!);
        if (!providerPostId) continue;
        await prisma.clipPublish.update({ where: { id: p.id }, data: { providerPostId } });
      }
      const post = await prisma.socialPost.findUnique({
        where: { accountId_providerPostId: { accountId: p.socialAccountId, providerPostId } },
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
