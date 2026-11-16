import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { affiliatePatchSchema } from "@/lib/admin/schemas";

// PATCH /api/admin/affiliates/[id]  body: { status?, commissionRate?, isCreatorPartner?, creatorHandle?, reason? }
// status is a strict enum and commissionRate is bounded 0–0.5 — an admin typo
// like `2` (meaning 20%) must fail loudly, not become a 200% commission.
// reason is audit-trail only (e.g. why an affiliate was banned) — never
// persisted on the Affiliate row itself.
export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { reason, ...data } = await parseBody(req, affiliatePatchSchema);

  const before = await prisma.affiliate.findUnique({
    where: { id },
    select: { status: true, commissionRate: true, isCreatorPartner: true, creatorHandle: true },
  });
  if (!before) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

  // Becoming a creator partner starts the clock shown in the admin list.
  const affiliate = await prisma.affiliate.update({
    where: { id },
    data: {
      ...data,
      ...(data.creatorHandle !== undefined ? { creatorHandle: data.creatorHandle || null } : {}),
      ...(data.isCreatorPartner === true && !before.isCreatorPartner ? { creatorSince: new Date() } : {}),
    },
  });

  await auditAdminAction(admin.userId, "affiliate.updated", id, {
    before,
    after: data,
    reason,
    ip: auditIp(req),
  });

  return NextResponse.json({ affiliate });
});
