import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateSession } from "@/lib/auth";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { opsSessionsRevokeSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";

// POST — revoke every non-admin session (incident response: force re-login
// after a suspected token leak or before maintenance). Iterates user ids from
// Postgres rather than scanning Redis keys, keeping lib/redis untouched.
export const POST = withAdmin(async (req, { admin }) => {
  await parseBody(req, opsSessionsRevokeSchema); // { confirm: true } required — see schema comment

  const { allowed } = await rateLimit(`admin-revoke-all-sessions:${admin.userId}`, 10, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

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
