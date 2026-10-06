import type { NextRequest } from "next/server";
import { twoFactorRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/2fa/verify-login/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/2fa { ticket, code } → a session. code is a TOTP or recovery code. Wraps /api/auth/2fa/verify-login.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, twoFactorRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
