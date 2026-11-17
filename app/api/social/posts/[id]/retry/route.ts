import type { NextRequest } from "next/server";
import { ok, withSocial } from "@/lib/social/api";
import { retryPost } from "@/lib/mobile/posts";
import { asHttp } from "@/lib/social/posts-web";

// POST /api/social/posts/:id/retry → { data: { post } }: a failed or missed post, again now.
export const POST = withSocial<{ id: string }>(async (_req: NextRequest, { auth, params }) => {
  return ok({ post: await asHttp(() => retryPost(auth.userId, params.id)) });
});
