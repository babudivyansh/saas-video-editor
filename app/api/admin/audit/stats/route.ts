import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { auditFiltersSchema, buildAuditWhere, legacyActorType } from "@/lib/admin/audit-query";
import { describeAction, type AuditCategory, type AuditSeverity } from "@/lib/admin/audit-catalog";

// Rows aggregated per request — the log is small (hundreds to low thousands a
// month); past this the response says `truncated` rather than going slow.
const MAX_ROWS = 20_000;

// GET /api/admin/audit/stats — the Audit Log's overview for the SAME filters
// as the list: events per day by category, totals by severity, top actions,
// most active admins, and destructive actions recorded without a reason.
// Defaults to the last 30 days. `tz` buckets days in the viewer's timezone.
export const GET = withAdmin(async (req) => {
  const filters = parseQuery(req, auditFiltersSchema);
  const from = filters.from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
  const where = await buildAuditWhere({ ...filters, from });
  const empty = { from, to: filters.to ?? null, total: 0, truncated: false, days: [], bySeverity: {}, byCategory: {}, topActions: [], topActors: [], missingReason: 0 };
  if (!where) return NextResponse.json(empty);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS + 1,
    select: { action: true, createdAt: true, adminId: true, actorType: true, reason: true, after: true },
  });
  const truncated = rows.length > MAX_ROWS;
  const sample = truncated ? rows.slice(0, MAX_ROWS) : rows;

  let tz = filters.tz;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = undefined;
  }
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" });

  const days = new Map<string, Partial<Record<AuditCategory, number>>>();
  const bySeverity: Partial<Record<AuditSeverity, number>> = {};
  const byCategory: Partial<Record<AuditCategory, number>> = {};
  const actions = new Map<string, number>();
  const actors = new Map<string, { count: number; type: string; last: Date }>();
  let missingReason = 0;

  for (const r of sample) {
    const info = describeAction(r.action);
    const day = dayOf.format(r.createdAt);
    const d = days.get(day) ?? {};
    d[info.category] = (d[info.category] ?? 0) + 1;
    days.set(day, d);
    bySeverity[info.severity] = (bySeverity[info.severity] ?? 0) + 1;
    byCategory[info.category] = (byCategory[info.category] ?? 0) + 1;
    actions.set(r.action, (actions.get(r.action) ?? 0) + 1);
    const a = actors.get(r.adminId) ?? { count: 0, type: r.actorType ?? legacyActorType(r.action), last: r.createdAt };
    a.count++;
    if (r.createdAt > a.last) a.last = r.createdAt;
    actors.set(r.adminId, a);
    if (info.expectsReason && !r.reason && !(r.after ?? "").includes('"reason"')) missingReason++;
  }

  const topActorIds = [...actors.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const emails = new Map(
    (await prisma.user.findMany({ where: { id: { in: topActorIds.map(([id]) => id) } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]),
  );

  return NextResponse.json({
    from,
    to: filters.to ?? null,
    total: sample.length,
    truncated,
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, counts]) => ({ day, ...counts })),
    bySeverity,
    byCategory,
    topActions: [...actions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([action, count]) => ({ action, label: describeAction(action).label, count })),
    topActors: topActorIds.map(([id, a]) => ({ id, email: emails.get(id) ?? id, type: a.type, count: a.count, lastAt: a.last.toISOString() })),
    missingReason,
  });
});
