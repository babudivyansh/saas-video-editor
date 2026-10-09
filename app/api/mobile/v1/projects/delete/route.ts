import type { NextRequest } from "next/server";
import { bulkDeleteRequest } from "@clipiro/shared";
import { deleteProjects } from "@/lib/mobile/projects";
import { mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/mobile/v1/projects/delete { ids } → { deleted, skipped }: up to 50
// of the caller's projects in one statement (the app's multi-select). Ids that
// aren't the caller's are ignored, so `deleted` may be fewer than sent.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, bulkDeleteRequest);
    if (!body.ok) return body.res;
    return mobileJson(await deleteProjects(auth.userId, [...new Set(body.data.ids)]));
  }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "mobile:projects-delete" },
);
