import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { withCronTracking } from "@/lib/cron-tracking";
import { sendAdminDailyDigestEmail } from "@/lib/email";
import { buildStaffDigest } from "@/lib/admin/staff-digest";
import { getSignupAlertSettings, sendToEach, signupAlertRecipients } from "@/lib/admin/signup-alerts";

// 09:00 IST staff summary (lib/admin/staff-digest.ts). Replaces one email per
// signup; only sends when Admin → Operations → Notifications has signup emails
// set to "Daily" (the default).
//   30 3 * * *  curl -H "Authorization: Bearer $CRON_SECRET" \
//                 https://clipiro.com/api/cron/admin-daily-digest
async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSignupAlertSettings();
  if (settings.signupMode !== "daily") {
    return NextResponse.json({ ok: true, skipped: `signup emails are "${settings.signupMode}"` });
  }

  const [digest, to] = await Promise.all([buildStaffDigest(new Date()), signupAlertRecipients(settings)]);
  const results = await sendToEach(to, "daily-digest", (addr) => sendAdminDailyDigestEmail(addr, digest));
  const sent = results.filter((r) => r.status === "sent" || r.status === "dev-logged").length;
  return NextResponse.json({ ok: true, sent, recipients: to.length, signups: digest.signups });
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("admin-daily-digest", handleGET);
