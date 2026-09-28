import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeLogin, setSessionCookie } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { grantFreeTierMinutes } from "@/lib/minutes";
import { attributeReferral } from "@/lib/affiliate";
import { recordSignupAttribution } from "@/lib/marketing-analytics";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { consumeOtp } from "@/lib/otp";
import { readPendingSignup, clearPendingSignup } from "@/lib/signup-pending";
import { normalizeEmail } from "@/lib/auth-validation";
import { greetingName } from "@/lib/display-name";

// Same brute-force ceiling as the sign-in code: 5 guesses per address per
// 10 minutes is room for a typo and nowhere near enough to guess 1 in 900k.
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;

// POST /api/auth/register/verify { email, otp }
//
// Step two of signup. The code proves the inbox, so this is where the account
// is actually created — with emailVerifiedAt already set — and everything
// that used to happen at register time happens now: free credits and
// minutes, referral + campaign attribution (their cookies ride on this same
// browser request), the session, the welcome email.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email || !body.otp) {
      return NextResponse.json({ error: "Enter the code we emailed you" }, { status: 400 });
    }

    const limit = await rateLimit(`signup-verify:${email}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code and try again in a few minutes." },
        { status: 429 },
      );
    }

    const pending = await readPendingSignup(email);
    if (!pending) {
      return NextResponse.json(
        { error: "This signup has expired. Please sign up again.", expired: true },
        { status: 400 },
      );
    }

    if (!(await consumeOtp("signup", email, body.otp))) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    await clearPendingSignup(email);

    let user: { id: string; email: string; credits: number };
    try {
      user = await prisma.user.create({
        data: {
          email,
          name: pending.name,
          passwordHash: pending.passwordHash,
          hasPassword: true,
          emailVerifiedAt: new Date(),
          // Signup grant lands in the bonus bucket (30-day expiry); the monthly
          // free-tier drip is anchored one month out from signup.
          credits: 10,
          bonusCredits: 10,
          bonusCreditsExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          freeCreditsRefillAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        },
        select: { id: true, email: true, credits: true },
      });
    } catch (err) {
      // Someone finished a signup (or Google sign-in) for this address while
      // the code was in flight.
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      throw err;
    }

    // The free tier's Clip Minutes, through the ledgered helper (a raw column
    // write here would leave refunds nothing to restore against). Best-effort:
    // a failed grant must not fail the signup — the monthly drip retries it.
    await grantFreeTierMinutes(user.id, "grant:signup").catch((e) =>
      logger.error("auth", `signup minutes grant failed for ${user.id}`, e));

    const { token } = await completeLogin(req, user);

    const referralOutcome = await attributeReferral({
      cookieCode: req.cookies.get("affiliate_ref")?.value ?? null,
      typedCode: pending.referralCode,
      email,
      newUser: { id: user.id, name: pending.name },
      // The rightmost trusted hop, not the client-supplied leftmost one — the
      // same-subnet fraud check is worthless if the signer can pick the IP.
      signupIp: (() => { const ip = getClientIp(req); return ip === "unknown" ? null : ip; })(),
    });
    // Never leak the affiliate's own email/name back to the newly-registered
    // client — only the outcome (and code, on success) is safe to return.
    const referralForClient = referralOutcome
      ? referralOutcome.applied
        ? { applied: true as const, code: referralOutcome.code }
        : referralOutcome
      : undefined;

    const res = NextResponse.json(
      { token, user, ...(referralForClient ? { referral: referralForClient } : {}) },
      { status: 201 },
    );
    setSessionCookie(res, token);
    // Clear the affiliate cookie after attribution
    res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });
    // Same shape for campaign attribution: record the conversion and clear the
    // first-touch cookie. Never throws; a missing cookie is a no-op.
    await recordSignupAttribution(req, res, "/register");

    sendWelcomeEmail(user.email, greetingName(pending.name), user.credits).catch(
      (e) => logger.error("register", "welcome email error", e),
    );

    return res;
  } catch (err) {
    logger.error("register-verify", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
