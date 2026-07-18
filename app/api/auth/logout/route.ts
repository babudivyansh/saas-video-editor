import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, invalidateOneSession, clearSessionCookie } from "@/lib/auth";

// JS can't clear an httpOnly cookie, so sign-out must round-trip through the
// server: this clears the session cookie AND invalidates the cached Redis
// session, before the client drops its localStorage Bearer token. Signing
// out only ends THIS device's session — other concurrent sessions (see the
// Sessions settings page) are untouched, matching how every multi-device
// SaaS treats a plain "sign out" versus an explicit "sign out everywhere".
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth) {
    await invalidateOneSession(auth.userId, auth.sessionId).catch(() => {});
  }

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
