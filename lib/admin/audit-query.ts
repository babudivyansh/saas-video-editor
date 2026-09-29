import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashAuditRow } from "@/lib/admin/audit";
import {
  actionsExpectingReason, actionsInCategory, actionsWithSeverity, describeAction, patternPrefixesIn,
  type AuditCategory, type AuditSeverity, type AuditTargetType,
} from "@/lib/admin/audit-catalog";
import { resolveTargets, targetKey } from "@/lib/admin/audit-targets";

// Shared by the Audit Log list, stats, CSV export and per-account Activity:
// one filter → Prisma `where` translation, and one row → readable-event
// enrichment, so every view of the log agrees with every other.

const blank = (v: unknown) => (v === "" ? undefined : v);
const CATEGORIES = ["accounts", "billing", "security", "content", "operations", "config", "reviews", "affiliates", "social"] as const;
const SEVERITIES = ["critical", "destructive", "money", "security", "change", "view"] as const;

export const auditFiltersSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(200).optional()),
  action: z.preprocess(blank, z.string().max(64).optional()),
  targetId: z.preprocess(blank, z.string().max(128).optional()),
  /** An account's whole history: events done TO it or BY it. */
  involving: z.preprocess(blank, z.string().max(128).optional()),
  adminEmail: z.preprocess(blank, z.string().max(200).optional()),
  targetEmail: z.preprocess(blank, z.string().max(200).optional()),
  category: z.preprocess(blank, z.enum(CATEGORIES).optional()),
  severity: z.preprocess(blank, z.enum(SEVERITIES).optional()),
  actorType: z.preprocess(blank, z.enum(["admin", "user", "system"]).optional()),
  missingReason: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
  // ISO instants from the browser (its own timezone). A bare YYYY-MM-DD still
  // works: `to` then means the whole of that (UTC) day.
  from: z.preprocess(blank, z.string().max(40).optional()),
  to: z.preprocess(blank, z.string().max(40).optional()),
  cursor: z.preprocess(blank, z.string().max(64).optional()),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  tz: z.preprocess(blank, z.string().max(64).optional()),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

// Rows written before actorType existed: these two flows were user-initiated.
const LEGACY_USER_ACTIONS = ["affiliate.payout_requested", "social.connect", "social.disconnect", "social.refresh", "social.revoked", "social.needs_reauth"];

export function legacyActorType(action: string): "admin" | "user" {
  return LEGACY_USER_ACTIONS.includes(action) ? "user" : "admin";
}

function parseBound(raw: string | undefined, end: boolean): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return end && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(d.getTime() + 86_399_999) : d;
}

function actionFilter(actions: string[], prefixes: string[]): Prisma.AuditLogWhereInput {
  return { OR: [{ action: { in: actions } }, ...prefixes.map((p) => ({ action: { startsWith: p } }))] };
}

/** The Prisma `where` for a filter set, or null when a filter can't match anything (unknown email). */
export async function buildAuditWhere(f: AuditFilters, { withDates = true } = {}): Promise<Prisma.AuditLogWhereInput | null> {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (f.action) and.push({ action: { startsWith: f.action } });
  if (f.targetId) and.push({ targetId: f.targetId });
  if (f.involving) and.push({ OR: [{ targetId: f.involving }, { adminId: f.involving }] });
  if (f.category) and.push(actionFilter(actionsInCategory(f.category), patternPrefixesIn({ category: f.category })));
  if (f.severity) and.push(actionFilter(actionsWithSeverity(f.severity), patternPrefixesIn({ severity: f.severity })));
  if (f.missingReason) {
    and.push({ action: { in: actionsExpectingReason() } }, { reason: null }, { NOT: { after: { contains: '"reason"' } } });
  }
  if (f.actorType === "system") and.push({ actorType: "system" });
  if (f.actorType === "user") and.push({ OR: [{ actorType: "user" }, { actorType: null, action: { in: LEGACY_USER_ACTIONS } }] });
  if (f.actorType === "admin") and.push({ OR: [{ actorType: "admin" }, { actorType: null, action: { notIn: LEGACY_USER_ACTIONS } }] });

  if (f.adminEmail) {
    const ids = (await prisma.user.findMany({ where: { email: { contains: f.adminEmail, mode: "insensitive" } }, select: { id: true } })).map((u) => u.id);
    if (ids.length === 0) return null;
    and.push({ adminId: { in: ids } });
  }
  if (f.targetEmail) {
    const ids = (await prisma.user.findMany({ where: { email: { contains: f.targetEmail, mode: "insensitive" } }, select: { id: true } })).map((u) => u.id);
    if (ids.length === 0) return null;
    and.push({ targetId: { in: ids } });
  }
  if (f.q) {
    const c = { contains: f.q, mode: "insensitive" as const };
    and.push({ OR: [{ action: c }, { targetId: c }, { reason: c }, { before: c }, { after: c }] });
  }
  if (withDates) {
    const from = parseBound(f.from, false);
    const to = parseBound(f.to, true);
    if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }
  return and.length ? { AND: and } : {};
}

export type AuditRow = Prisma.AuditLogGetPayload<object>;

export interface AuditEventView {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  description: string;
  category: AuditCategory;
  severity: AuditSeverity;
  expectsReason: boolean;
  /** An action that should carry a reason, recorded without one. */
  missingReason: boolean;
  actor: { id: string; email: string | null; type: "admin" | "user" | "system" };
  target: { id: string; type: AuditTargetType; label: string; href: string | null; deleted: boolean } | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  before: unknown;
  after: unknown;
  /** verified = this row's hash matches its content; tampered = it doesn't; legacy = written before hashing. */
  integrity: "verified" | "tampered" | "legacy";
}

function parseJson(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Legacy rows kept reason/ip inside after._meta — pull them out, and out of the displayed snapshot. */
function splitMeta(after: unknown): { after: unknown; meta: { reason?: string; ip?: string } } {
  if (after && typeof after === "object" && !Array.isArray(after) && "_meta" in after) {
    const { _meta, ...rest } = after as { _meta?: { reason?: string; ip?: string } } & Record<string, unknown>;
    const keys = Object.keys(rest);
    // `{ value: x, _meta }` was the wrapper for a non-object `after`.
    return { after: keys.length === 1 && keys[0] === "value" ? rest.value : keys.length ? rest : null, meta: _meta ?? {} };
  }
  return { after, meta: {} };
}

export async function enrichAuditRows(rows: AuditRow[]): Promise<AuditEventView[]> {
  const infos = rows.map((r) => describeAction(r.action));
  const actorIds = [...new Set(rows.map((r) => r.adminId))];
  const [actors, targets] = await Promise.all([
    actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } }) : [],
    resolveTargets(rows.map((r, i) => ({ targetId: r.targetId, targetType: infos[i].targetType, before: r.before }))),
  ]);
  const email = new Map(actors.map((a) => [a.id, a.email]));

  return rows.map((r, i) => {
    const info = infos[i];
    const { after, meta } = splitMeta(parseJson(r.after));
    const reason = r.reason ?? meta.reason ?? null;
    const t = r.targetId ? targets.get(targetKey(info.targetType, r.targetId)) : undefined;
    const actorType = (r.actorType as AuditEventView["actor"]["type"] | null) ?? (r.adminId.startsWith("system") ? "system" : legacyActorType(r.action));
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      label: info.label,
      description: info.description,
      category: info.category,
      severity: info.severity,
      expectsReason: !!info.expectsReason,
      missingReason: !!info.expectsReason && !reason,
      actor: { id: r.adminId, email: email.get(r.adminId) ?? null, type: actorType },
      target: r.targetId ? { id: r.targetId, type: info.targetType, label: t?.label ?? r.targetId, href: t?.href ?? null, deleted: t?.deleted ?? false } : null,
      reason,
      ip: r.ip ?? meta.ip ?? null,
      userAgent: r.userAgent,
      sessionId: r.sessionId,
      before: parseJson(r.before),
      after,
      integrity: !r.hash ? "legacy" : hashAuditRow(r) === r.hash ? "verified" : "tampered",
    };
  });
}
