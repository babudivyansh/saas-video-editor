import type { NextRequest } from "next/server";
import { loginRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/auth/login/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/login { email, password } → a session, { requires2fa, ticket } or { requiresEmailVerification, email, passwordProof }. Wraps /api/auth/login.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, loginRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
