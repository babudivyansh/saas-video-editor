import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { enqueueAccountExport } from "@/lib/account-export";

const bodySchema = z.object({ reason: z.string().trim().min(3, "Give a reason (it goes in the audit log)").max(500) }).strict();

// POST /api/admin/users/[id]/export  { reason }
// Builds the same "download my data" bundle the user can request themselves
// (lib/account-export.ts) — for a data-access request that came in through
// support. The user is NOT emailed; the admin polls
// GET .../export/[jobId] for the download link. Personal data, so a reason is
// required and the request is audited.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { reason } = await parseBody(req, bodySchema);
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { allowed } = await rateLimit(`admin-user-export:${admin.userId}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: "Too many exports — try again later." }, { status: 429 });

  const jobId = enqueueAccountExport(user.id, { notifyUser: false });
  await auditAdminAction(admin.userId, "user.data_exported", user.id, { after: { jobId }, reason, ip: auditIp(req) });
  return NextResponse.json({ jobId }, { status: 202 });
});
