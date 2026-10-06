import type { NextRequest } from "next/server";
import { verifyEmailRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/verify-otp/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/login/verify-email { email, otp, passwordProof } → a session or { requires2fa, ticket }. Finishes a login that had to prove the inbox first. Wraps /api/auth/verify-otp.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, verifyEmailRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
