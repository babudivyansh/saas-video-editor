import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/auth/verify-email/confirm { token } — intentionally
// unauthenticated (the token itself is the credential, same as
// reset-password/confirm) since the link is opened from an email client that
// may not carry the app's session.
async function handlePOST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Verification token is required" }, { status: 400 });
  }

  const userId = await redis.get(`verify-email:${token}`);
  if (!userId) {
    return NextResponse.json({ error: "This verification link has expired or is invalid." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await redis.del(`verify-email:${token}`);

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 900, keyBy: "ip", name: "verify-email:confirm" });
