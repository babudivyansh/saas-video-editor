import { NextRequest, NextResponse } from "next/server";
import { completeLogin, setSessionCookie } from "@/lib/auth";
import { consumeOtp } from "@/lib/otp";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// A 6-digit OTP has ~900k possible values with no lockout otherwise brute-
// forceable well within its 10-minute TTL. Limit to 5 verify attempts per
// identifier per 10 minutes — enough for a genuine typo, nowhere near enough
// to guess a code.
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: AuthMethod = body.method === "phone" ? "phone" : "email";
    const identifier = normalizeIdentifier(method, body.identifier ?? body.email ?? body.phone ?? "");
    const { otp } = body;

    if (!identifier || !otp) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const limit = await rateLimit(`otp-verify:${method}:${identifier}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code and try again in a few minutes." },
        { status: 429 },
      );
    }

    const ok = await consumeOtp(method, identifier, otp);
    if (!ok) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    const user = await findUserByMethod(method, identifier);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { token } = await completeLogin(req, user);

    const res = NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    logger.error("verify-otp", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
