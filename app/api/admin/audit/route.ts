import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { auditFiltersSchema, buildAuditWhere, enrichAuditRows } from "@/lib/admin/audit-query";

const CSV_BATCH = 500;

// Cursor-batched CSV of the (filtered) audit trail — constant memory, and the
// same readable fields the viewer shows (admin email, category, severity,
// reason, IP, device, integrity), not just the raw JSON columns.
function exportCsv(where: Prisma.AuditLogWhereInput): NextResponse {
  const encoder = new TextEncoder();
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["createdAt", "actorType", "actorEmail", "actorId", "action", "summary", "category", "severity", "target", "targetId", "reason", "ip", "userAgent", "sessionId", "integrity", "before", "after"];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(header.join(",") + "\n"));
      let cursor: string | undefined;
      for (;;) {
        const batch = await prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: CSV_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (batch.length === 0) break;
        const rows = (await enrichAuditRows(batch)).map((e) =>
          [
            e.createdAt, e.actor.type, e.actor.email, e.actor.id, e.action, `${e.label}${e.target ? ` ${e.target.label}` : ""}`,
            e.category, e.severity, e.target?.label, e.target?.id, e.reason, e.ip, e.userAgent, e.sessionId, e.integrity, e.before, e.after,
          ].map(cell).join(","),
        );
        controller.enqueue(encoder.encode(rows.join("\n") + "\n"));
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

// GET /api/admin/audit?q&category&severity&actorType&missingReason&action&targetId
//                     &adminEmail&targetEmail&from&to&cursor&limit[&export=csv]
// Readable, filterable audit events (lib/admin/audit-query.ts), newest first,
// cursor-paginated. Stats for the same filters: GET /api/admin/audit/stats.
export const GET = withAdmin(async (req) => {
  const filters = parseQuery(req, auditFiltersSchema);
  const where = await buildAuditWhere(filters);
  if (!where) return NextResponse.json({ events: [], total: 0, nextCursor: null });

  if (req.nextUrl.searchParams.get("export") === "csv") return exportCsv(where);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    }),
    prisma.auditLog.count({ where }),
  ]);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;

  return NextResponse.json({
    events: await enrichAuditRows(page),
    total,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});
