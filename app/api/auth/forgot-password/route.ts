import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import crypto from "crypto";

const RESET_TTL = 60 * 15; // 15 minutes

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
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
    select: { id: true, email: true, firstName: true, name: true },
  });

  // Always return success to avoid email enumeration
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`pwd-reset:${token}`, user.id, "EX", RESET_TTL);

  const resetLink = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(user.email, user.firstName ?? user.name ?? "", resetLink);
  } catch (err) {
    logger.error("forgot-password", "email send failed", err);
  }

  return NextResponse.json({ ok: true });
}
