import type { NextRequest } from "next/server";
import { bulkDeleteRequest } from "@clipiro/shared";
import { deleteClips } from "@/lib/mobile/projects";
import { mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/mobile/v1/clips/delete { ids } → { deleted, skipped }: up to 50 of
// the caller's clips. Clips still rendering, queued, captioning or dubbing are
// skipped (lib/clip-busy.ts), as the web's single delete refuses them.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, bulkDeleteRequest);
    if (!body.ok) return body.res;
    return mobileJson(await deleteClips(auth.userId, [...new Set(body.data.ids)]));
  }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "mobile:clips-delete" },
);
