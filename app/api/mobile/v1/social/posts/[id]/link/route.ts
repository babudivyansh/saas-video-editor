import type { NextRequest } from "next/server";
import { linkPostRequest } from "@clipiro/shared";
import { mobileJson, parseBody, withMobileSubscriber } from "@/lib/mobile/http";
import { linkPost, postErrorResponse } from "@/lib/mobile/posts";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/social/posts/:id/link { permalink } → { post }: "I posted
// it". The link lets the Social Tracker pull the post's numbers.
export const POST = withMobileSubscriber(async (req: NextRequest, auth, { params }: Ctx) => {
  const body = await parseBody(req, linkPostRequest);
  if (!body.ok) return body.res;
  try {
    return mobileJson({ post: await linkPost(auth.userId, (await params).id, body.data.permalink) });
  } catch (e) {
    return postErrorResponse(e);
  }
});
