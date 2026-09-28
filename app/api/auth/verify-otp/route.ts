import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, setLocaleCookieFromUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { consumeOtp } from "@/lib/otp";
import { emailFromBody, findUserByEmail } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { mintTwoFactorTicket } from "@/lib/two-factor-ticket";
import { takePasswordProven } from "@/lib/login-verification";
import { claimUnverifiedAccount } from "@/lib/account-claim";
import { logger } from "@/lib/logger";

// A 6-digit OTP has ~900k possible values with no lockout otherwise brute-
// forceable well within its 10-minute TTL. Limit to 5 verify attempts per
// identifier per 10 minutes — enough for a genuine typo, nowhere near enough
// to guess a code.
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;

// POST /api/auth/verify-otp { email, otp } — finishes an email-code sign-in,
// and the one-time address check a password login asks unverified accounts
// for (see app/api/auth/login and lib/login-verification.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = emailFromBody(body);
    const { otp } = body;

    if (!email || !otp) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const limit = await rateLimit(`otp-verify:email:${email}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code and try again in a few minutes." },
        { status: 429 },
      );
    }

    const ok = await consumeOtp("login", email, otp);
    if (!ok) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    let user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Same gates as /api/auth/login. This route is a login, not a lesser
    // "verification" — without these it was a way around all three of them:
    // suspended and deactivated accounts could sign in, and 2FA could be
    // skipped entirely by anyone who could read the inbox.
    if (user.suspendedAt) {
      return NextResponse.json(
        { error: "This account has been suspended. Contact support if you believe this is a mistake." },
        { status: 403 },
      );
    }
    if (user.deactivatedAt) {
      return NextResponse.json({ error: "This account is deactivated.", deactivated: true }, { status: 403 });
    }

    // First proof of this inbox. If the same login already proved the
    // password, the address is simply verified. If only the code was proven,
    // the password (and any 2FA) may belong to whoever registered the address
    // first — the inbox owner takes the account over clean.
    if (!user.emailVerifiedAt) {
      if (await takePasswordProven(email, user.id)) {
        user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      } else {
        await claimUnverifiedAccount(user.id);
        user = (await findUserByEmail(email))!;
      }
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json({ requires2fa: true, ticket: await mintTwoFactorTicket(user.id) });
    }

    const token = await finishLogin(req, user, getClientIp(req));

    const res = NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
    setSessionCookie(res, token);
    setLocaleCookieFromUser(res, user.preferredLanguage);
    return res;
  } catch (err) {
    logger.error("verify-otp", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
