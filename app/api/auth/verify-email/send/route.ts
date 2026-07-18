import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { sendVerifyEmailEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const VERIFY_TTL = 60 * 30; // 30 minutes, matches the email copy

// POST /api/auth/verify-email/send — (re)sends a verification link for the
// caller's own current (not pending) email. Mirrors forgot-password's
// Redis-token pattern exactly.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, firstName: true, name: true, emailVerifiedAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`verify-email:${token}`, user.id, "EX", VERIFY_TTL);

  const verifyLink = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  try {
    await sendVerifyEmailEmail(user.email, user.firstName ?? user.name ?? "", verifyLink);
  } catch (err) {
    logger.error("verify-email-send", "email send failed", err);
    return NextResponse.json({ error: "Failed to send verification email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 900, keyBy: "user", name: "verify-email:send" });
