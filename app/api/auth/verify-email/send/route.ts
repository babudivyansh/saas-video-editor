import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";

// POST /api/auth/verify-email/send — emails a 6-digit code for the caller's
// own current (not pending) address; /api/auth/verify-email/confirm checks
// it. A code rather than the old link: one verification mechanism across
// signup, sign-in and Settings, and nothing that has to survive being opened
// on another device.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  try {
    return NextResponse.json({ ok: true, ...(await issueOtp("verify", user.email)) });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 502 });
    }
    throw err;
  }
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 900, keyBy: "user", name: "verify-email:send" });
