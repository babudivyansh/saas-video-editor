import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withRateLimit } from "@/lib/with-rate-limit";
import { encryptSecret } from "@/lib/encryption";
import { generateTotpSecret, buildOtpauthUri } from "@/lib/totp";

const SETUP_TTL = 600; // 10 minutes to scan + confirm before the pending secret expires

// POST /api/auth/2fa/setup { password } — password-confirmed (step-up for a
// security-changing action). Generates a new secret, holds it PENDING in
// Redis (encrypted) rather than writing it to the user row yet — nothing
// persists until /api/auth/2fa/enable proves the user actually scanned it
// and can produce a valid code.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your password to continue" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled" }, { status: 409 });
  }

  const secret = generateTotpSecret();
  await redis.set(`2fa-setup:${auth.userId}`, encryptSecret(secret), "EX", SETUP_TTL);

  const otpauthUri = buildOtpauthUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);

  return NextResponse.json({ secret, otpauthUri, qrDataUrl });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "user", name: "2fa:setup" });
