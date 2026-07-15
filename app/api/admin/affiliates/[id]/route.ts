import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { affiliatePatchSchema } from "@/lib/admin/schemas";

// PATCH /api/admin/affiliates/[id]  body: { status?, commissionRate? }
// status is a strict enum and commissionRate is bounded 0–0.5 — an admin typo
// like `2` (meaning 20%) must fail loudly, not become a 200% commission.
export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const data = await parseBody(req, affiliatePatchSchema);

  const before = await prisma.affiliate.findUnique({
    where: { id },
    select: { status: true, commissionRate: true },
  });
  if (!before) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

  const affiliate = await prisma.affiliate.update({ where: { id }, data });

  await auditAdminAction(admin.userId, "affiliate.updated", id, {
    before,
    after: data,
    ip: auditIp(req),
  });

  return NextResponse.json({ affiliate });
});
