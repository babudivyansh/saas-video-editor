import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Fixed-cost dummy hash, same enumeration-timing defense as /api/auth/login.
const DUMMY_HASH = "$2b$12$ipMR8KgUrP3uE9KmGnmsnu9652Wk4V/4DG8PcTNPmZashszFKZSHC";
const TWO_FA_TICKET_TTL = 300;

// POST /api/account/reactivate { method, identifier, password } — the
// recovery path for a deactivated account (see app/api/account/deactivate).
// Intentionally unauthenticated: login itself refuses a deactivated account
// (see app/api/auth/login), so proving credentials here IS how you get back
// in. Re-enabled 2FA is honored via the same 2fa-pending ticket
// /api/auth/2fa/verify-login already knows how to complete.
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
    const limit = await rateLimit(`reactivate:${identifier}`, 8, 900);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }

    const user = await findUserByMethod(method, identifier);
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

    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null, deactivationScheduledPurgeAt: null },
    });

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
    return res;
  } catch (err) {
    logger.error("account-reactivate", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
