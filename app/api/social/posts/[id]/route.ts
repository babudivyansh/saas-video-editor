import type { NextRequest } from "next/server";
import { updatePostRequest } from "@clipiro/shared";
import { ok, parseBody, withSocial } from "@/lib/social/api";
import { deletePost, updatePost } from "@/lib/mobile/posts";
import { asHttp } from "@/lib/social/posts-web";

type Params = { id: string };

// PATCH /api/social/posts/:id { title?, caption?, hashtags?, privacy?, scheduledAt? } → { data: { post } }
// Only while it is scheduled and hasn't started.
export const PATCH = withSocial<Params>(async (req: NextRequest, { auth, params }) => {
  const body = await parseBody(req, updatePostRequest);
  return ok({ post: await asHttp(() => updatePost(auth.userId, params.id, body)) });
});

// DELETE /api/social/posts/:id → { data: { ok } }: cancels a scheduled post, or
// removes a finished one from Clipiro (never the post on the platform).
// Not subscriber-gated: people can always remove their own rows.
export const DELETE = withSocial<Params>(
  async (_req: NextRequest, { auth, params }) => {
    await asHttp(() => deletePost(auth.userId, params.id));
    return ok({ ok: true });
  },
  { subscriber: false },
);
