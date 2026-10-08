import type { NextRequest } from "next/server";
import { POST as webRead } from "@/app/api/notifications/[id]/read/route";
import { toMobileNotifications, type WebNotification } from "@/lib/mobile/notifications";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/notifications/:id/read → the notification, read. Wraps the web route.
export const POST = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const r = await callWeb(webRead, req, {}, "POST", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  const [n] = await toMobileNotifications(auth.userId, [r.json.notification as WebNotification]);
  return mobileJson(n);
});
