import type { NextRequest } from "next/server";
import { forgotPasswordRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/forgot-password/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/forgot-password { email } → { ok } whether or not the account exists. The reset link opens the web page. Wraps /api/auth/forgot-password.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, forgotPasswordRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
