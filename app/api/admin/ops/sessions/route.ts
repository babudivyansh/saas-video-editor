import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateSession } from "@/lib/auth";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";

// POST — revoke every non-admin session (incident response: force re-login
// after a suspected token leak or before maintenance). Iterates user ids from
// Postgres rather than scanning Redis keys, keeping lib/redis untouched.
export const POST = withAdmin(async (req, { admin }) => {
  const users = await prisma.user.findMany({ where: { role: "USER" }, select: { id: true } });
  let revoked = 0;
  for (const u of users) {
    await invalidateSession(u.id);
    revoked++;
  }
  await auditAdminAction(admin.userId, "sessions.revoked_all_non_admin", undefined, {
    after: { usersAffected: revoked },
    ip: auditIp(req),
  });
  return NextResponse.json({ success: true, revoked });
});
