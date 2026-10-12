import type { NextRequest } from "next/server";
import { GET as webCount } from "@/app/api/notifications/unread-count/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/notifications/unread-count → { unreadCount }: the bell's badge.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest) => {
    const r = await callWeb(webCount, req, undefined, "GET");
    if (r.status >= 400) return webError(r);
    return mobileJson({ unreadCount: r.json.unreadCount ?? 0 });
  }),
  { limit: 240, windowSec: 60, keyBy: "user", name: "mobile:notifications:count" },
);
