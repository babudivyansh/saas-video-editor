import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { auditQuerySchema } from "@/lib/admin/schemas";

const CSV_BATCH = 1000;

// Cursor-batched CSV stream of the (filtered) audit trail — constant memory
// regardless of table size, same pattern as the purchases export.
function exportCsv(where: Prisma.AuditLogWhereInput): NextResponse {
  const encoder = new TextEncoder();
  const cell = (v: string | null) => {
    const s = v ?? "";
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("createdAt,adminId,action,targetId,before,after\n"));
      let cursor: string | undefined;
      for (;;) {
        const batch = await prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: CSV_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (batch.length === 0) break;
        const rows = batch
          .map((l) =>
            [l.createdAt.toISOString(), l.adminId, l.action, l.targetId, l.before, l.after].map(cell).join(","),
          )
          .join("\n");
        controller.enqueue(encoder.encode(rows + "\n"));
        if (batch.length < CSV_BATCH) break;
        cursor = batch[batch.length - 1].id;
      }
      controller.close();
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${Date.now()}.csv"`,
    },
  });
}

// GET /api/admin/audit?page&limit&action=&targetId=&adminEmail=&from=&to=
// Filterable audit trail + a 30-day per-admin activity summary (first page).
export const GET = withAdmin(async (req) => {
  const { page, limit, action, targetId, adminEmail, from, to } = parseQuery(req, auditQuerySchema);

  let adminIdFilter: string[] | undefined;
  if (adminEmail) {
    const matches = await prisma.user.findMany({
      where: { email: { contains: adminEmail, mode: "insensitive" } },
      select: { id: true },
    });
    adminIdFilter = matches.map((m) => m.id);
    if (adminIdFilter.length === 0) {
      return NextResponse.json({ logs: [], total: 0, page, limit, byAdmin: [] });
    }
  }

  const where = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(targetId ? { targetId } : {}),
    ...(adminIdFilter ? { adminId: { in: adminIdFilter } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 86_399_000) } : {}),
          },
        }
      : {}),
  };

  if (req.nextUrl.searchParams.get("export") === "csv") {
    return exportCsv(where);
  }

  const [logs, total, byAdminRaw] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, adminId: true, action: true, targetId: true, before: true, after: true, createdAt: true },
    }),
    prisma.auditLog.count({ where }),
    page === 1
      ? prisma.auditLog.groupBy({
          by: ["adminId"],
          _count: true,
          _max: { createdAt: true },
          where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
          orderBy: { _count: { adminId: "desc" } },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  // Resolve admin emails for display (also covers "system:*" webhook actors,
  // which simply won't resolve and display as-is).
  const adminIds = [...new Set([...logs.map((l) => l.adminId), ...byAdminRaw.map((a) => a.adminId)])];
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
    : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.email]));

  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, adminEmail: adminMap[l.adminId] ?? l.adminId })),
    total,
    page,
    limit,
    byAdmin: byAdminRaw.map((a) => ({
      adminEmail: adminMap[a.adminId] ?? a.adminId,
      actions30d: a._count,
      lastActionAt: a._max.createdAt,
    })),
  });
});
