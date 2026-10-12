import type { NextRequest } from "next/server";
import { updatePostRequest } from "@clipiro/shared";
import { mobileJson, parseBody, withMobileSubscriber } from "@/lib/mobile/http";
import { deletePost, getPost, postErrorResponse, toPost, updatePost } from "@/lib/mobile/posts";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/social/posts/:id → { post }
export const GET = withMobileSubscriber(async (_req: NextRequest, auth, { params }: Ctx) => {
  try {
    return mobileJson({ post: await toPost(await getPost(auth.userId, (await params).id)) });
  } catch (e) {
    return postErrorResponse(e);
  }
});

// PATCH /api/mobile/v1/social/posts/:id { title?, caption?, hashtags?, privacy?, scheduledAt? } → { post }
// Only while it is scheduled and hasn't started.
export const PATCH = withMobileSubscriber(async (req: NextRequest, auth, { params }: Ctx) => {
  const body = await parseBody(req, updatePostRequest);
  if (!body.ok) return body.res;
  try {
    return mobileJson({ post: await updatePost(auth.userId, (await params).id, body.data) });
  } catch (e) {
    return postErrorResponse(e);
  }
});

// DELETE /api/mobile/v1/social/posts/:id → { ok }: cancels a scheduled post, or
// removes a finished one from Clipiro (never the post on the platform).
export const DELETE = withMobileSubscriber(async (_req: NextRequest, auth, { params }: Ctx) => {
  try {
    await deletePost(auth.userId, (await params).id);
    return mobileJson({ ok: true });
  } catch (e) {
    return postErrorResponse(e);
  }
});
