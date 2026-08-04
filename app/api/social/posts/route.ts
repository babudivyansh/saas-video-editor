import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertOwnedAccount, parseQuery, withSocial } from "@/lib/social/api";
import { accountIdSchema, cursorSchema } from "@/lib/social/schemas";

// GET /api/social/posts?accountId=…&sort=views&type=reel&q=…&cursor=…
//
// v1's post list. Superseded by /api/social/content, which adds score sorts,
// richer filters and correct keyset pagination; this stays only because the v1
// page still calls it, and stage 10 deletes it with that page.
//
// The id-only cursor below is the reason /content exists: it skips or repeats
// rows whenever the sort column ties, which it does constantly for likes and
// comments. Not fixed here — fixing it would change v1's pagination behaviour
// for a surface that is being removed.
const PAGE_SIZE = 25;

const legacySortSchema = z
  .enum(["publishedAt", "views", "likes", "comments", "reach"])
  .default("publishedAt");

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({
    accountId: accountIdSchema,
    sort: legacySortSchema,
    type: z.string().trim().max(32).optional(),
    q: z.string().trim().max(200).optional(),
    cursor: cursorSchema,
  }));
  const account = await assertOwnedAccount(auth.userId, q.accountId);

  const where: Prisma.SocialPostWhereInput = {
    accountId: account.id,
    ...(q.type ? { mediaType: q.type } : {}),
    ...(q.q ? { caption: { contains: q.q, mode: "insensitive" } } : {}),
  };

  const posts = await prisma.socialPost.findMany({
    where,
    // Secondary id ordering makes the keyset cursor stable across equal values.
    orderBy: [{ [q.sort]: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: {
      id: true, providerPostId: true, caption: true, thumbnailUrl: true, permalink: true,
      mediaType: true, publishedAt: true, views: true, likes: true, comments: true,
      shares: true, saves: true, reach: true, watchTimeSec: true,
    },
  });

  const hasMore = posts.length > PAGE_SIZE;
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
  return NextResponse.json({ posts: page, nextCursor: hasMore ? page[page.length - 1].id : null });
}, {
  rateLimit: { key: (auth) => `social:posts:${auth.userId}`, max: 60, windowSec: 60 },
});
