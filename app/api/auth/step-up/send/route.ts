import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";

// POST /api/auth/step-up/send — emails the code that stands in for the
// password on sensitive actions, for accounts that have no password their
// owner knows (Google signups). See lib/step-up.ts.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, hasPassword: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.hasPassword) {
    return NextResponse.json({ error: "Confirm with your password instead." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await issueOtp("step-up", user.email)) });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      return NextResponse.json({ error: "We couldn't send the code. Please try again." }, { status: 503 });
    }
    throw err;
  }
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 900, keyBy: "user", name: "auth:step-up:send" });
