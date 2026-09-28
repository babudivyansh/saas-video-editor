import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { consumeOtp } from "@/lib/otp";

// POST /api/auth/verify-email/confirm { otp } — checks the code sent by
// /api/auth/verify-email/send. Authenticated: the code is only good for the
// signed-in caller's own address. 5 tries per 10 minutes (keyed by user) is
// room for a typo and nowhere near enough to guess one in 900k.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { otp } = await req.json().catch(() => ({}));
  if (!otp) return NextResponse.json({ error: "Enter the code we emailed you" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  if (!(await consumeOtp("verify", user.email, otp))) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: auth.userId }, data: { emailVerifiedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, { limit: 5, windowSec: 600, keyBy: "user", name: "verify-email:confirm" });
