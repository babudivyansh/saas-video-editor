import { NextRequest, NextResponse } from "next/server";
import { signToken, cacheSession } from "@/lib/auth";
import { consumeOtp } from "@/lib/otp";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { rateLimit } from "@/lib/rate-limit";

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

    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
