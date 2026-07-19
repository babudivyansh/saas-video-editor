import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { setSessionCookie } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { LOCALE_COOKIE, isSupportedLocale } from "@/lib/i18n-locales";

// Fixed-cost bcrypt hash with no matching password, compared against when the
// account doesn't exist so the response takes the same time either way and
// can't be used to enumerate valid identifiers.
const DUMMY_HASH = "$2b$12$ipMR8KgUrP3uE9KmGnmsnu9652Wk4V/4DG8PcTNPmZashszFKZSHC";

const TWO_FA_TICKET_TTL = 300; // 5 minutes to complete the second factor

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: AuthMethod = body.method === "phone" ? "phone" : "email";
    const identifier = normalizeIdentifier(method, body.identifier ?? body.email ?? body.phone ?? "");
    const { password } = body;

    if (!identifier || !password) {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const [idLimit, ipLimit] = await Promise.all([
      rateLimit(`login:id:${identifier}`, 8, 900),
      rateLimit(`login:ip:${ip}`, 30, 900),
    ]);
    if (!idLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    const user = await findUserByMethod(method, identifier);
    // Always run a compare — against the dummy hash when the user doesn't
    // exist — so both branches take the same time and timing can't be used
    // to enumerate valid identifiers.
    const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Suspension is enforced here (plus session revocation at suspend time in
    // the admin API) rather than on every request — getAuthUser stays a pure
    // Redis check with no per-request DB read.
    if (user.suspendedAt) {
      return NextResponse.json(
        { error: "This account has been suspended. Contact support if you believe this is a mistake." },
        { status: 403 },
      );
    }

    // Deactivated accounts don't get a normal login — the client should
    // offer /api/account/reactivate instead of failing this silently.
    if (user.deactivatedAt) {
      return NextResponse.json(
        { error: "This account is deactivated.", deactivated: true },
        { status: 403 },
      );
    }

    // Password verified but a second factor is required — pause here rather
    // than issuing a session. No LoginEvent/alert email/session exists yet;
    // those only happen once /api/auth/2fa/verify-login actually completes.
    if (user.twoFactorEnabled) {
      const ticket = randomUUID();
      await redis.set(`2fa-pending:${ticket}`, user.id, "EX", TWO_FA_TICKET_TTL);
      return NextResponse.json({ requires2fa: true, ticket });
    }

    const token = await finishLogin(req, user, ip);

    const res = NextResponse.json({
      token,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
    setSessionCookie(res, token);
    // Refreshes the locale cookie from the DB so a fresh browser/device picks
    // up the user's saved language preference immediately, not just "en".
    if (isSupportedLocale(user.preferredLanguage)) {
      res.cookies.set(LOCALE_COOKIE, user.preferredLanguage, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
    }
    return res;
  } catch (err) {
    logger.error("login", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
