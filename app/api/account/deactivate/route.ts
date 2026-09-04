import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser, invalidateAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { cancelRazorpaySubscriptionBestEffort } from "@/lib/billing/cancel-on-account-lifecycle";

const PURGE_WINDOW_DAYS = 30;

// POST /api/account/deactivate { password } — password-confirmed soft
// deactivation. Login is blocked while deactivatedAt is set (see
// app/api/auth/login); reactivating within the window (app/api/account/reactivate)
// clears it. Past the window, the deactivation cron hard-deletes via the same
// lib/account-deletion.ts core the user-initiated delete uses.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your password to continue" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { passwordHash: true, razorpaySubscriptionId: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 400 });

  const purgeAt = new Date(Date.now() + PURGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: auth.userId },
    data: { deactivatedAt: new Date(), deactivationScheduledPurgeAt: purgeAt },
  });

  // Deactivating implies "stop using this account everywhere, right now."
  await invalidateAllSessions(auth.userId);

  // Deactivated users can't reach Billing to cancel themselves (login is
  // blocked while deactivated) — without this, an active subscription would
  // keep auto-charging for up to PURGE_WINDOW_DAYS with nobody able to stop
  // it. Best-effort: a Razorpay outage must not block deactivation itself.
  if (user.razorpaySubscriptionId) {
    void cancelRazorpaySubscriptionBestEffort(user.razorpaySubscriptionId, auth.userId, "deactivate");
  }

  return NextResponse.json({ ok: true, purgeAt });
}

export const POST = withRateLimit(handlePOST, { limit: 5, windowSec: 900, keyBy: "user", name: "account:deactivate" });
