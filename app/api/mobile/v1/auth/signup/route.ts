import type { NextRequest } from "next/server";
import { signupRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/register/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/signup { name, email, password, confirmPassword, referralCode? } → 202 { pending, email, signupToken }. Wraps /api/auth/register.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, signupRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
