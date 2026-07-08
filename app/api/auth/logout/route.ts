import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, invalidateSession, clearSessionCookie } from "@/lib/auth";

// JS can't clear an httpOnly cookie, so sign-out must round-trip through the
// server: this clears the session cookie AND invalidates the cached Redis
// session, before the client drops its localStorage Bearer token.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth) {
    await invalidateSession(auth.userId).catch(() => {});
  }

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
