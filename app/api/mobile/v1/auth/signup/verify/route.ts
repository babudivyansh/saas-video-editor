import type { NextRequest } from "next/server";
import { signupVerifyRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/register/verify/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/signup/verify { email, otp, signupToken } → 201 session. Creates the account. Wraps /api/auth/register/verify.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, signupVerifyRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
