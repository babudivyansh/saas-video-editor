import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, setLocaleCookieFromUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { mintTwoFactorTicket } from "@/lib/two-factor-ticket";
import { emailFromBody, findUserByEmail } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";
import { markPasswordProven } from "@/lib/login-verification";
import { logger } from "@/lib/logger";

// Fixed-cost dummy hash, same enumeration-timing defense as /api/auth/login.
const DUMMY_HASH = "$2b$12$ipMR8KgUrP3uE9KmGnmsnu9652Wk4V/4DG8PcTNPmZashszFKZSHC";

// POST /api/account/reactivate { email, password } — the recovery path for a
// deactivated account (see app/api/account/deactivate).
// Intentionally unauthenticated: login itself refuses a deactivated account
// (see app/api/auth/login), so proving credentials here IS how you get back
// in. Re-enabled 2FA is honored via the same 2fa-pending ticket
// /api/auth/2fa/verify-login already knows how to complete.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = emailFromBody(body);
    const { password } = body;

    if (!email || !password || typeof password !== "string") {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const [idLimit, ipLimit] = await Promise.all([
      rateLimit(`reactivate:${email}`, 8, 900),
      rateLimit(`reactivate:ip:${ip}`, 30, 900),
    ]);
    if (!idLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }

    const user = await findUserByEmail(email);
    const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!user.deactivatedAt) {
      return NextResponse.json({ error: "This account isn't deactivated — use the normal login page." }, { status: 400 });
    }
    if (user.suspendedAt) {
      return NextResponse.json({ error: "This account has been suspended. Contact support if you believe this is a mistake." }, { status: 403 });
    }

    // With 2FA on, the deactivation is only lifted once the second factor
    // passes — 2fa/verify-login does it, flagged by the ticket. Lifting it
    // here first (as this route used to) let the password alone cancel a
    // deactivation and its scheduled purge.
    if (user.twoFactorEnabled) {
      return NextResponse.json({ requires2fa: true, ticket: await mintTwoFactorTicket(user.id, { reactivate: true }) });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null, deactivationScheduledPurgeAt: null },
    });

    // Same one-time address check as /api/auth/login — reactivating must not
    // be a way to skip it. verify-otp finishes the sign-in.
    if (!user.emailVerifiedAt) {
      const passwordProof = await markPasswordProven(email, user.id);
      try {
        const extras = await issueOtp("login", email);
        return NextResponse.json({ requiresEmailVerification: true, email, passwordProof, ...extras });
      } catch (err) {
        if (err instanceof OtpDeliveryError) {
          return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 503 });
        }
        throw err;
      }
    }

    const token = await finishLogin(req, user, ip);
    const res = NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
    setSessionCookie(res, token);
    setLocaleCookieFromUser(res, user.preferredLanguage);
    return res;
  } catch (err) {
    logger.error("account-reactivate", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
