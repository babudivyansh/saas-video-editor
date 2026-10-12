import type { NextRequest } from "next/server";
import { POST as webReadAll } from "@/app/api/notifications/read-all/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/notifications/read-all → { ok }. Wraps the web route.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webReadAll, req, {});
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
