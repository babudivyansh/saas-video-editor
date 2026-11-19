import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { emailSettingsPatchSchema } from "@/lib/admin/schemas";
import { prisma } from "@/lib/prisma";
import { PAUSE_NONCRITICAL_KEY } from "@/lib/email/router/config";
import { ensureProviderRows } from "@/lib/email/router/store";
import { getEmailSettings } from "@/lib/email/router/admin-queries";

// Provider priority order, and the "pause non-critical email" switch (normal-
// priority mail is held and retried later; codes, resets, security and
// billing mail keep sending).
export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, emailSettingsPatchSchema);
  await ensureProviderRows();
  const beforeOrder = (await prisma.emailProviderStatus.findMany({ orderBy: { priority: "asc" } })).map((r) => r.provider);
  const beforeSettings = await getEmailSettings();

  if (body.priority) {
    await prisma.$transaction(
      body.priority.map((p, i) => prisma.emailProviderStatus.update({ where: { provider: p }, data: { priority: i + 1 } })),
    );
  }
  if (body.pauseNoncritical !== undefined) {
    await prisma.config.upsert({
      where: { key: PAUSE_NONCRITICAL_KEY },
      update: { value: JSON.stringify(body.pauseNoncritical) },
      create: { key: PAUSE_NONCRITICAL_KEY, value: JSON.stringify(body.pauseNoncritical) },
    });
  }

  await auditAdminAction(admin.userId, "email_settings.updated", undefined, {
    before: { priority: beforeOrder, pauseNoncritical: beforeSettings.pauseNoncritical },
    after: { priority: body.priority ?? beforeOrder, pauseNoncritical: body.pauseNoncritical ?? beforeSettings.pauseNoncritical },
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, settings: await getEmailSettings() });
});
