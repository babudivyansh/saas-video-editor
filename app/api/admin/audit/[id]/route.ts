import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";
import { enrichAuditRows } from "@/lib/admin/audit-query";

// GET /api/admin/audit/[id] — one event in full, plus the other events on the
// same target closest to it in time (what happened before and after).
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const row = await prisma.auditLog.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Audit entry not found" }, { status: 404 });

  const related = row.targetId
    ? await Promise.all([
        prisma.auditLog.findMany({
          where: { targetId: row.targetId, createdAt: { lt: row.createdAt } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.auditLog.findMany({
          where: { targetId: row.targetId, createdAt: { gt: row.createdAt } },
          orderBy: { createdAt: "asc" },
          take: 10,
        }),
      ]).then(([before, after]) => [...after.reverse(), ...before])
    : [];

  const [event, ...rest] = await enrichAuditRows([row, ...related]);
  return NextResponse.json({ event, related: rest });
});
