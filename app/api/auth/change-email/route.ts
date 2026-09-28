import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { sendChangeEmailConfirmationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyStepUp } from "@/lib/step-up";
import { isValidEmail, normalizeEmail } from "@/lib/auth-validation";
import { greetingName } from "@/lib/display-name";

const CHANGE_TTL = 60 * 30; // 30 minutes, matches the email copy

// POST /api/auth/change-email { newEmail, password } — password-confirmed
// (this is an identity-changing action). Never swaps User.email directly:
// sets pendingEmail and emails a confirmation link to the NEW address —
// app/api/auth/change-email/confirm finalizes it once clicked.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeEmail(body.newEmail);
  if (!isValidEmail(normalized)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Password, or an emailed code for accounts without one (lib/step-up.ts).
  const stepUp = await verifyStepUp(user, body);
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: 400 });

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
    await sendChangeEmailConfirmationEmail(normalized, greetingName(user.name), confirmLink);
  } catch (err) {
    logger.error("change-email", "email send failed", err);
    return NextResponse.json({ error: "Failed to send confirmation email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, pendingEmail: normalized });
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 900, keyBy: "user", name: "change-email:start" });
