import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

// Mark an alert resolved. It re-opens by itself if the condition recurs.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const r = await prisma.emailAlert.updateMany({ where: { id: params.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
  if (r.count === 0) return NextResponse.json({ error: "Not found or already resolved" }, { status: 404 });
  await auditAdminAction(admin.userId, "email_alert.resolved", undefined, { after: { alertId: params.id }, ip: auditIp(req) });
  return NextResponse.json({ ok: true });
});
