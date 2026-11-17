import type { NextRequest } from "next/server";
import { createPostsRequest } from "@clipiro/shared";
import { ok, withSocial } from "@/lib/social/api";
import { createPosts, listPosts } from "@/lib/mobile/posts";
import { asHttp, parsePostBody } from "@/lib/social/posts-web";

// Posts the person has made or planned from Clipiro (ClipPublish rows): the
// web twin of /api/mobile/v1/social/posts. Published-post METRICS live on
// /api/social/content; this is the scheduling side.

// GET /api/social/posts?from=&to=&status=&cursor= → { data: { posts, nextCursor } }
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const p = req.nextUrl.searchParams;
  return ok(
    await asHttp(() =>
      listPosts(auth.userId, { from: p.get("from"), to: p.get("to"), status: p.get("status"), cursor: p.get("cursor") }),
    ),
  );
});

// POST /api/social/posts { source, accountIds, title?, caption, hashtags, privacy, when }
// → 201 { data: { posts, warnings } }: one post per account.
export const POST = withSocial(
  async (req: NextRequest, { auth }) => {
    const body = await parsePostBody(req, createPostsRequest);
    return ok(await asHttp(() => createPosts(auth.userId, body)), { status: 201 });
  },
  { rateLimit: { key: (auth) => `social:posts:create:${auth.userId}`, max: 30, windowSec: 60 } },
);
