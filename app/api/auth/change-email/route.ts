import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { sendChangeEmailConfirmationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHANGE_TTL = 60 * 30; // 30 minutes, matches the email copy

// POST /api/auth/change-email { newEmail, password } — password-confirmed
// (this is an identity-changing action). Never swaps User.email directly:
// sets pendingEmail and emails a confirmation link to the NEW address —
// app/api/auth/change-email/confirm finalizes it once clicked.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { newEmail, password } = await req.json().catch(() => ({}));
  const normalized = typeof newEmail === "string" ? newEmail.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(normalized)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your password to confirm this change" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  if (normalized === user.email) {
    return NextResponse.json({ error: "That's already your current email" }, { status: 400 });
  }
  const taken = await prisma.user.findUnique({ where: { email: normalized } });
  if (taken) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });

  await prisma.user.update({ where: { id: user.id }, data: { pendingEmail: normalized } });

  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`change-email:${token}`, JSON.stringify({ userId: user.id, newEmail: normalized }), "EX", CHANGE_TTL);

  const confirmLink = `${env.NEXT_PUBLIC_APP_URL}/change-email-confirm?token=${token}`;
  try {
    await sendChangeEmailConfirmationEmail(normalized, user.firstName ?? user.name ?? "", confirmLink);
  } catch (err) {
    logger.error("change-email", "email send failed", err);
    return NextResponse.json({ error: "Failed to send confirmation email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, pendingEmail: normalized });
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 900, keyBy: "user", name: "change-email:start" });
