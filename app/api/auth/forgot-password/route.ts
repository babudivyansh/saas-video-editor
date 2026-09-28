import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/auth-validation";
import { greetingName } from "@/lib/display-name";
import { atLeast } from "@/lib/min-duration";

const RESET_TTL = 60 * 15; // 15 minutes
// Every answer takes at least this long, sent or not (see lib/min-duration.ts).
const RESPONSE_FLOOR_MS = 900;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const { email } = await req.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const [idLimit, ipLimit] = await Promise.all([
    rateLimit(`pwd-reset:${normalizedEmail}`, 3, 900),
    rateLimit(`pwd-reset:ip:${getClientIp(req)}`, 10, 900),
  ]);
  if (!idLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true },
  });

  // Always return success to avoid email enumeration — after the same
  // minimum delay, so the no-account branch isn't measurably faster.
  if (!user) {
    await atLeast(startedAt, RESPONSE_FLOOR_MS);
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`pwd-reset:${token}`, user.id, "EX", RESET_TTL);

  const resetLink = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(user.email, greetingName(user.name), resetLink);
  } catch (err) {
    logger.error("forgot-password", "email send failed", err);
  }

  await atLeast(startedAt, RESPONSE_FLOOR_MS);
  return NextResponse.json({ ok: true });
}
