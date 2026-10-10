import type { NextRequest } from "next/server";
import { GET as webConnect } from "@/app/api/social/connect/[provider]/route";
import { callWeb, mobileError, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ provider: string }> };

// GET /api/mobile/v1/social/connect/:provider → { url }: the platform's sign-in
// page, from the web's own connect (paid plans only, 20 per 10 minutes). The
// state it signs says "app", so the callback ends at clipiro://social
// (?connected=… or ?error=…) and the app's auth session closes there.
export const GET = withMobileAuth(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webConnect, req, undefined, "GET", { provider: (await params).provider }, { client: "app" });
  if (r.status === 402) return mobileError(402, String(r.json.error ?? "Social Tracker is available on paid plans."), { code: "subscription_required" });
  if (r.status >= 400) return webError(r);
  return typeof r.json.url === "string" ? mobileJson({ url: r.json.url }) : mobileError(502, "Couldn't start connecting. Try again.");
});
