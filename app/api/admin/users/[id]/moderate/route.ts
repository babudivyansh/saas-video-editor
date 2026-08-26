import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateSession } from "@/lib/auth";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { moderateUserSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/admin/users/[id]/moderate  body: { action: suspend|unsuspend|revoke_sessions, reason? }
// Suspend also revokes the live session immediately — login is blocked while
// suspendedAt is set (app/api/auth/login), so together the account is fully
// locked out without touching the per-request auth hot path.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const { allowed } = await rateLimit(`admin-moderate:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const { action, reason } = await parseBody(req, moderateUserSchema);

  if (id === admin.userId && action !== "revoke_sessions") {
    return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { suspendedAt: true, role: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (action === "suspend") {
    if (user.suspendedAt) return NextResponse.json({ error: "User is already suspended" }, { status: 409 });
    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "Demote the admin role before suspending this account." }, { status: 409 });
    }
    const suspendedAt = new Date();
    await prisma.user.update({ where: { id }, data: { suspendedAt } });
    await invalidateSession(id);
    await auditAdminAction(admin.userId, "user.suspended", id, {
      before: { suspendedAt: null },
      after: { suspendedAt },
      reason,
      ip: auditIp(req),
    });
    return NextResponse.json({ success: true, suspendedAt });
  }

  if (action === "unsuspend") {
    if (!user.suspendedAt) return NextResponse.json({ error: "User is not suspended" }, { status: 409 });
    await prisma.user.update({ where: { id }, data: { suspendedAt: null } });
    await auditAdminAction(admin.userId, "user.unsuspended", id, {
      before: { suspendedAt: user.suspendedAt },
      after: { suspendedAt: null },
      reason,
      ip: auditIp(req),
    });
    return NextResponse.json({ success: true });
  }

  await invalidateSession(id);
  await auditAdminAction(admin.userId, "user.sessions_revoked", id, { reason, ip: auditIp(req) });
  return NextResponse.json({ success: true });
});
