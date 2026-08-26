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

  // Shared by both queries below so the activity summary can never silently
  // diverge from the detail table by filtering on different fields — see
  // OBS-1: the summary previously hardcoded its own 30-day-only `where`,
  // completely independent of the active action/targetId/adminEmail/date
  // filters, so it could show a smaller count than the (unfiltered, or
  // differently-filtered) rows visible in the table right beneath it.
  const baseFilters = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(targetId ? { targetId } : {}),
    ...(adminIdFilter ? { adminId: { in: adminIdFilter } } : {}),
  };

  const where = {
    ...baseFilters,
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

  // Activity summary needs a lower bound to stay a bounded "recent activity"
  // view — defaults to 30 days back only when the caller hasn't set an
  // explicit `from`, and always respects an explicit `to`, so it's the same
  // filter set as `where` plus that one default.
  const summaryFrom = from ?? new Date(Date.now() - 30 * 86400_000);
  const byAdminWhere = {
    ...baseFilters,
    createdAt: {
      gte: summaryFrom,
      ...(to ? { lte: new Date(to.getTime() + 86_399_000) } : {}),
    },
  };

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
          where: byAdminWhere,
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
    // Lets the UI show the window the summary actually used (e.g. "since Jul 27")
    // instead of a hardcoded "LAST 30 DAYS" label that can silently stop
    // matching once a caller sets an explicit `from`/`to`.
    activityWindow: { from: summaryFrom.toISOString(), to: to ? to.toISOString() : null },
  });
});
