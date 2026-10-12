import type { NextRequest } from "next/server";
import { createPostsRequest } from "@clipiro/shared";
import { mobileJson, parseBody, withMobileSubscriber } from "@/lib/mobile/http";
import { createPosts, listPosts, postErrorResponse } from "@/lib/mobile/posts";

// The Social Studio's posts (docs/mobile/SCHEDULING.md §3.2). Subscriber-only,
// like the rest of Social.

// GET /api/mobile/v1/social/posts?from=&to=&status=&cursor= → { posts, nextCursor }
export const GET = withMobileSubscriber(async (req: NextRequest, auth) => {
  const p = req.nextUrl.searchParams;
  try {
    return mobileJson(await listPosts(auth.userId, { from: p.get("from"), to: p.get("to"), status: p.get("status"), cursor: p.get("cursor") }));
  } catch (e) {
    return postErrorResponse(e);
  }
});

// POST /api/mobile/v1/social/posts { source, accountIds, title?, caption, hashtags, privacy, when }
// → 201 { posts, warnings }: one post per account.
export const POST = withMobileSubscriber(async (req: NextRequest, auth) => {
  const body = await parseBody(req, createPostsRequest);
  if (!body.ok) return body.res;
  try {
    return mobileJson(await createPosts(auth.userId, body.data), 201);
  } catch (e) {
    return postErrorResponse(e);
  }
});
