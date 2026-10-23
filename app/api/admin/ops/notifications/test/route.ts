import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { sendTestSignupAlert } from "@/lib/admin/signup-alerts";

// POST /api/admin/ops/notifications/test — "Send test email" on the
// Notifications tab. Sends the real new-signup template to every current
// recipient and reports each address's outcome, so staff can prove delivery
// without creating a throwaway account.
export const POST = withAdmin(async (req, { admin }) => {
  const limit = await rateLimit(`signup-alerts-test:${admin.userId}`, 5, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many test emails. Try again in a few minutes." }, { status: 429 });
  }

  const results = await sendTestSignupAlert();

  await auditAdminAction(admin.userId, "signup_alerts.test_sent", undefined, {
    after: { results },
    ip: auditIp(req),
  });

  return NextResponse.json({ results });
});
