import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { emailProviderPatchSchema } from "@/lib/admin/schemas";
import { prisma } from "@/lib/prisma";
import { ensureProviderRows } from "@/lib/email/router/store";
import { dbAlertSink, alertKey } from "@/lib/email/router/alerts";
import { isKnownProvider } from "@/lib/email/router/admin-queries";

// Enable/disable a provider, change its configured quota limits, or clear a
// suspension. Credentials are never readable or writable here — they live in
// the host's environment variables only.
export const PATCH = withAdmin<{ provider: string }>(async (req, { admin, params }) => {
  if (!isKnownProvider(params.provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const body = await parseBody(req, emailProviderPatchSchema);
  await ensureProviderRows();
  const before = await prisma.emailProviderStatus.findUniqueOrThrow({ where: { provider: params.provider } });

  const after = await prisma.emailProviderStatus.update({
    where: { provider: params.provider },
    data: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.dailyLimit !== undefined ? { dailyLimit: body.dailyLimit } : {}),
      ...(body.monthlyLimit !== undefined ? { monthlyLimit: body.monthlyLimit } : {}),
      ...(body.clearSuspension ? { healthStatus: "unknown", circuitBreakerUntil: null, consecutiveFailures: 0 } : {}),
    },
  });

  if (body.clearSuspension) {
    await dbAlertSink.resolve(alertKey("provider_suspended", params.provider));
    await auditAdminAction(admin.userId, "email_provider.suspension_cleared", undefined, {
      before: { provider: params.provider, healthStatus: before.healthStatus },
      after: { provider: params.provider, healthStatus: after.healthStatus },
      reason: body.reason,
      ip: auditIp(req),
    });
  }
  if (body.enabled !== undefined || body.dailyLimit !== undefined || body.monthlyLimit !== undefined) {
    await auditAdminAction(admin.userId, "email_provider.updated", undefined, {
      before: { provider: params.provider, enabled: before.enabled, dailyLimit: before.dailyLimit, monthlyLimit: before.monthlyLimit },
      after: { provider: params.provider, enabled: after.enabled, dailyLimit: after.dailyLimit, monthlyLimit: after.monthlyLimit },
      reason: body.reason,
      ip: auditIp(req),
    });
  }
  return NextResponse.json({ ok: true });
});
