import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { invalidateAllSessions } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Same dual keying as forgot-password: per-token (a caller who somehow has
  // a live token still can't hammer bcrypt.hash indefinitely) and per-IP (the
  // generic guard against brute-forcing tokens at all).
  const [tokenLimit, ipLimit] = await Promise.all([
    rateLimit(`pwd-reset-confirm:token:${token}`, 3, 900),
    rateLimit(`pwd-reset-confirm:ip:${getClientIp(req)}`, 10, 900),
  ]);
  if (!tokenLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const userId = await redis.get(`pwd-reset:${token}`);
  if (!userId) {
    return NextResponse.json({ error: "This reset link has expired or is invalid. Please request a new one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Consume the token and invalidate every active session — a password reset
  // implies the old password may be compromised, so every device re-logs in.
  await redis.del(`pwd-reset:${token}`);
  await invalidateAllSessions(userId);

  return NextResponse.json({ ok: true });
}
