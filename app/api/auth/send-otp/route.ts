import { NextRequest, NextResponse } from "next/server";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";
import { emailFromBody, findUserByEmail } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { atLeast } from "@/lib/min-duration";
import { logger } from "@/lib/logger";

// Every answer takes at least this long, sent or not (see lib/min-duration.ts).
const RESPONSE_FLOOR_MS = 900;

// POST /api/auth/send-otp { email } — emails a sign-in code. Email only: the
// phone variant was removed 2026-09-28 (it returned the code in the response
// whenever SMS delivery wasn't configured or failed).
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const email = emailFromBody(body);

    if (!email) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [idLimit, ipLimit] = await Promise.all([
      rateLimit(`otp-send:email:${email}`, 3, 600),
      rateLimit(`otp-send:ip:${getClientIp(req)}`, 10, 600),
    ]);
    if (!idLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    // OTP is a sign-in method, so the account must already exist — but we
    // don't reveal that: a non-existent address gets the same success
    // response, after the same minimum delay, as a real one (no code is sent).
    const user = await findUserByEmail(email);
    if (!user) {
      await atLeast(startedAt, RESPONSE_FLOOR_MS);
      return NextResponse.json({ success: true });
    }

    const extras = await issueOtp("login", email);
    await atLeast(startedAt, RESPONSE_FLOOR_MS);
    return NextResponse.json({ success: true, ...extras });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      return NextResponse.json({ error: "We couldn't send the code. Please try again." }, { status: 503 });
    }
    logger.error("send-otp", "request failed", err);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
