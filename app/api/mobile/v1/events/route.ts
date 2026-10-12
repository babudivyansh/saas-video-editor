import type { NextRequest } from "next/server";
import { appEventRequest } from "@clipiro/shared";
import { recordAppEvent } from "@/lib/mobile/app-events";
import { mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/mobile/v1/events { event, appVersion } → { ok }: one app event,
// counted per day (mobile Phase 15, R2 A). Signed in to keep junk out; who
// sent it isn't stored.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest) => {
    const body = await parseBody(req, appEventRequest);
    if (!body.ok) return body.res;
    await recordAppEvent(body.data.event, body.data.appVersion);
    return mobileJson({ ok: true });
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:events" },
);
