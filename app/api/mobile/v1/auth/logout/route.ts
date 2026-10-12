import type { NextRequest } from "next/server";
import { logoutRequest } from "@clipiro/shared";
import { getAuthUser, invalidateOneSession, revokeMobileSession } from "@/lib/auth";
import { mobileJson, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/logout { refreshToken? } with the access token as
// Bearer → { ok }. Either credential ends this device's session, so logging
// out still works when the access token has already expired. Always ok:
// a session that is already gone is logged out.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, logoutRequest);
  if (!body.ok) return body.res;

  if (body.data.refreshToken) await revokeMobileSession(body.data.refreshToken);
  const auth = await getAuthUser(req);
  if (auth) await invalidateOneSession(auth.userId, auth.sessionId);
  return mobileJson({ ok: true });
}
