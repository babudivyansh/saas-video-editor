import type { NextRequest } from "next/server";
import { mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { postErrorResponse, retryPost } from "@/lib/mobile/posts";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/social/posts/:id/retry → { post }: a failed or missed post, again now.
export const POST = withMobileSubscriber(async (_req: NextRequest, auth, { params }: Ctx) => {
  try {
    return mobileJson({ post: await retryPost(auth.userId, (await params).id) });
  } catch (e) {
    return postErrorResponse(e);
  }
});
