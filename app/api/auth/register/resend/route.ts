import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";
import { readPendingSignup } from "@/lib/signup-pending";
import { normalizeEmail } from "@/lib/auth-validation";

// POST /api/auth/register/resend { email } — a fresh signup code for a signup
// that is still pending. Answers the same way whether or not one is pending,
// so it can't be used to learn which addresses are mid-signup.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const [emailLimit, ipLimit] = await Promise.all([
      rateLimit(`signup-resend:${email}`, 3, 600),
      rateLimit(`signup-resend:ip:${getClientIp(req)}`, 10, 600),
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }

    if (!(await readPendingSignup(email))) {
      return NextResponse.json({ ok: true });
    }

    try {
      return NextResponse.json({ ok: true, ...(await issueOtp("signup", email)) });
    } catch (err) {
      if (err instanceof OtpDeliveryError) {
        return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 503 });
      }
      throw err;
    }
  } catch (err) {
    logger.error("register-resend", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
