import type { NextRequest } from "next/server";
import { GET as webList } from "@/app/api/notifications/route";
import { toMobileNotifications, type WebNotification } from "@/lib/mobile/notifications";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/notifications?cursor= → { items, nextCursor, unreadCount }:
// newest first, 30 a page, each with the app screen it opens. Wraps the web route.
export const GET = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const cursor = req.nextUrl.searchParams.get("cursor");
    const r = await callWeb(webList, req, undefined, "GET", undefined, { limit: "30", ...(cursor ? { cursor } : {}) });
    if (r.status >= 400) return webError(r);
    const items = await toMobileNotifications(auth.userId, (r.json.items ?? []) as WebNotification[]);
    return mobileJson({ items, nextCursor: r.json.nextCursor ?? null, unreadCount: r.json.unreadCount ?? 0 });
  }),
  { limit: 120, windowSec: 60, keyBy: "user", name: "mobile:notifications" },
);
