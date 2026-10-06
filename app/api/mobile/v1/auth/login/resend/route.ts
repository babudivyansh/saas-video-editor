import type { NextRequest } from "next/server";
import { resendCodeRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/send-otp/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/login/resend { email } → { ok }. A fresh code for login/verify-email. Wraps /api/auth/send-otp.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, resendCodeRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
