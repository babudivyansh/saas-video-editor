import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { planPatchSchema } from "@/lib/admin/schemas";

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const data = await parseBody(req, planPatchSchema);

  const before = await prisma.plan.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const plan = await prisma.plan.update({ where: { id }, data });

  await auditAdminAction(admin.userId, "plan.updated", id, { before, after: data, ip: auditIp(req) });

  return NextResponse.json({ plan });
});

// Soft-delete by deactivating so historical purchases keep their plan reference.
export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const plan = await prisma.plan.update({ where: { id }, data: { active: false } });

  await auditAdminAction(admin.userId, "plan.deactivated", id, { after: { active: false }, ip: auditIp(req) });

  return NextResponse.json({ plan });
});
