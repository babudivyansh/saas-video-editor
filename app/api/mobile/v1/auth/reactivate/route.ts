import type { NextRequest } from "next/server";
import { loginRequest } from "@clipiro/shared";
import { POST as web } from "@/app/api/account/reactivate/route";
import { asMobileSession, callWeb, parseBody } from "@/lib/mobile/http";

// POST /api/mobile/v1/auth/reactivate { email, password } → like login, for an account deactivated within its 30 days. Wraps /api/account/reactivate.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, loginRequest);
  if (!body.ok) return body.res;
  return asMobileSession(await callWeb(web, req, body.data));
}
