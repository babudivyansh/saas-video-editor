import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateSession } from "@/lib/auth";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { userBulkSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/admin/users/bulk — suspend, unsuspend or sign out many accounts.
// confirmPhrase must be "<n> users" for the n ids sent. Admin accounts and
// the caller are always skipped (and reported), never acted on.
export const POST = withAdmin(async (req, { admin }) => {
  const { ids, action, confirmPhrase, reason } = await parseBody(req, userBulkSchema);
  const unique = [...new Set(ids)];
  if (confirmPhrase.trim() !== `${unique.length} users`) {
    return NextResponse.json({ error: `Type "${unique.length} users" to confirm` }, { status: 400 });
  }
  const { allowed } = await rateLimit(`admin-user-bulk:${admin.userId}`, 5, 900);
  if (!allowed) return NextResponse.json({ error: "Too many bulk actions — try again shortly." }, { status: 429 });

  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, role: true } });
  const targets = users.filter((u) => u.role !== "ADMIN" && u.id !== admin.userId).map((u) => u.id);
  const skipped = unique.length - targets.length;

  if (action === "suspend") {
    await prisma.user.updateMany({ where: { id: { in: targets }, suspendedAt: null }, data: { suspendedAt: new Date() } });
  } else if (action === "unsuspend") {
    await prisma.user.updateMany({ where: { id: { in: targets } }, data: { suspendedAt: null } });
  }
  if (action !== "unsuspend") await Promise.allSettled(targets.map((id) => invalidateSession(id)));

  await auditAdminAction(admin.userId, `user.bulk_${action}`, undefined, {
    after: { ids: targets, skipped },
    reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, affected: targets.length, skipped });
});
