import type { NextRequest } from "next/server";
import { linkPostRequest } from "@clipiro/shared";
import { ok, withSocial } from "@/lib/social/api";
import { linkPost } from "@/lib/mobile/posts";
import { asHttp, parsePostBody } from "@/lib/social/posts-web";

// POST /api/social/posts/:id/link { permalink } → { data: { post } }: "I posted it".
// The link lets the tracker pull the post's numbers.
export const POST = withSocial<{ id: string }>(async (req: NextRequest, { auth, params }) => {
  const { permalink } = await parsePostBody(req, linkPostRequest);
  return ok({ post: await asHttp(() => linkPost(auth.userId, params.id, permalink)) });
});
