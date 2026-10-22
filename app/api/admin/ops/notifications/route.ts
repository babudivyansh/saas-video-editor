import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { signupAlertsSchema } from "@/lib/admin/schemas";
import { adminAccountEmails, getSignupAlertSettings, setSignupAlertSettings } from "@/lib/admin/signup-alerts";

// Staff email notifications (Admin → Operations → Notifications). Today that
// is the "new signup" email (lib/admin/signup-alerts.ts).
export const GET = withAdmin(async () => {
  const [signup, adminEmails] = await Promise.all([getSignupAlertSettings(), adminAccountEmails()]);
  return NextResponse.json({ signup, adminEmails });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, signupAlertsSchema);
  const before = await getSignupAlertSettings();
  const after = await setSignupAlertSettings(body);

  await auditAdminAction(admin.userId, "signup_alerts.updated", undefined, {
    before: { ...before },
    after: { ...after },
    ip: auditIp(req),
  });

  return NextResponse.json({ signup: after });
});
