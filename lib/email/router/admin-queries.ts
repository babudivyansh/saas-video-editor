// Read side of Admin → Email. Server-only; every query is bounded (range ≤ 92
// days, page size ≤ 100) and nothing here returns a payload, an idempotency
// key, or an unmasked address in a list.
//
// Metric definitions (also shown on the page):
//   Attempted      messages the app asked to send in the range (suppressed excluded)
//   Accepted       a provider accepted it (acceptedAt set) — NOT proof of delivery
//   Delivered      the provider reported the receiving server took it (webhook)
//   Failed         no provider took it, or dead-lettered after retries
//   Bounced        bounced or marked as spam (webhook)
//   Delivery rate  delivered ÷ (delivered + bounced + failed). Messages still
//                  pending, deferred, unknown, or accepted with no report yet are
//                  EXCLUDED from both sides and counted separately as
//                  "awaiting confirmation" — so the rate is about settled mail only.
//   Fallback rate  accepted messages that were not sent by the first provider
//                  tried ÷ accepted

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maskEmail } from "@/lib/mask-email";
import { PAUSE_NONCRITICAL_KEY, quotaThresholds, routerEnabled, fallbackEnabled } from "./config";
import { PROVIDERS } from "./deliver";
import { dayPeriod, monthPeriod } from "./periods";
import { prismaRouterStore } from "./store";
import { PROVIDER_NAMES, type ProviderName } from "./types";

export const MAX_RANGE_DAYS = 92;
export const MAX_PAGE_SIZE = 100;

export interface Range { from: Date; to: Date }

export function resolveRange(preset: string | undefined, from?: string, to?: string, now = new Date()): Range {
  const end = now;
  if (preset === "custom" && from && to) {
    const f = new Date(from);
    const t = new Date(to);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f < t) {
      const max = new Date(t.getTime() - MAX_RANGE_DAYS * 86_400_000);
      return { from: f < max ? max : f, to: t };
    }
  }
  if (preset === "today") return { from: dayPeriod(now).start, to: end };
  const days = preset === "30d" ? 30 : 7;
  return { from: new Date(end.getTime() - days * 86_400_000), to: end };
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function getEmailOverview(range: Range) {
  const where = { createdAt: { gte: range.from, lt: range.to }, status: { not: "suppressed" } };
  const hourly = range.to.getTime() - range.from.getTime() <= 2 * 86_400_000;
  const bucket = hourly ? Prisma.sql`date_trunc('hour', "createdAt")` : Prisma.sql`date_trunc('day', "createdAt")`;

  const [byStatus, accepted, fallback, latency, series, byProvider, byTemplate, byPriority, awaiting] = await Promise.all([
    prisma.emailMessage.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.emailMessage.count({ where: { ...where, acceptedAt: { not: null } } }),
    prisma.emailMessage.count({ where: { ...where, acceptedAt: { not: null }, fallbackUsed: true } }),
    prisma.emailAttempt.aggregate({
      where: { startedAt: { gte: range.from, lt: range.to }, status: "accepted" },
      _avg: { latencyMs: true },
    }),
    prisma.$queryRaw<{ bucket: Date; total: bigint; accepted: bigint; delivered: bigint; failed: bigint; fallback: bigint }[]>`
      SELECT ${bucket} AS bucket,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "acceptedAt" IS NOT NULL) AS accepted,
             COUNT(*) FILTER (WHERE "status" = 'delivered') AS delivered,
             COUNT(*) FILTER (WHERE "status" IN ('failed', 'bounced', 'complained')) AS failed,
             COUNT(*) FILTER (WHERE "fallbackUsed" AND "acceptedAt" IS NOT NULL) AS fallback
      FROM "EmailMessage"
      WHERE "createdAt" >= ${range.from} AND "createdAt" < ${range.to} AND "status" <> 'suppressed'
      GROUP BY 1 ORDER BY 1`,
    prisma.emailMessage.groupBy({ by: ["provider"], where: { ...where, acceptedAt: { not: null } }, _count: { _all: true } }),
    prisma.emailMessage.groupBy({ by: ["templateId"], where, _count: { _all: true }, orderBy: { _count: { templateId: "desc" } }, take: 15 }),
    prisma.emailMessage.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    prisma.emailMessage.count({ where: { ...where, status: { in: ["pending", "sending", "deferred", "unknown", "accepted"] } } }),
  ]);

  const c = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const attempted = byStatus.reduce((a, b) => a + b._count._all, 0);
  const delivered = c("delivered");
  const bounced = c("bounced") + c("complained");
  const failed = c("failed");
  const settled = delivered + bounced + failed;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), granularity: hourly ? "hour" : "day" },
    totals: {
      attempted, accepted, delivered, failed, bounced,
      deferred: c("deferred"), unknown: c("unknown"), awaitingConfirmation: awaiting,
      deliveryRate: settled > 0 ? delivered / settled : null,
      acceptanceRate: attempted > 0 ? accepted / attempted : null,
      fallbackRate: accepted > 0 ? fallback / accepted : null,
      avgApiLatencyMs: latency._avg.latencyMs == null ? null : Math.round(latency._avg.latencyMs),
    },
    series: series.map((s) => ({
      t: s.bucket.toISOString(), total: n(s.total), accepted: n(s.accepted), delivered: n(s.delivered),
      failed: n(s.failed), fallback: n(s.fallback),
    })),
    byProvider: PROVIDER_NAMES.map((p) => ({ provider: p, accepted: byProvider.find((b) => b.provider === p)?._count._all ?? 0 })),
    byTemplate: byTemplate.map((t) => ({ templateId: t.templateId, count: t._count._all })),
    byPriority: (["critical", "high", "normal"] as const).map((p) => ({
      priority: p, count: byPriority.find((b) => b.priority === p)?._count._all ?? 0,
    })),
  };
}

export async function getProviderCards(now = new Date()) {
  const states = await prismaRouterStore.getProviderStates();
  const extra = await prisma.emailProviderStatus.findMany();
  const day = dayPeriod(now);
  const month = monthPeriod(now);
  const usage = await prisma.emailQuotaUsage.findMany({ where: { periodStart: { in: [day.start, month.start] } } });
  const { warning, critical } = quotaThresholds();

  return states.map((s) => {
    const row = extra.find((e) => e.provider === s.provider);
    const u = (type: "day" | "month", start: Date, limit: number | null) => {
      const r = usage.find((x) => x.provider === s.provider && x.periodType === type && x.periodStart.getTime() === start.getTime());
      const used = r?.reservedCount ?? 0;
      return {
        used, accepted: r?.acceptedCount ?? 0, rejected: r?.rejectedCount ?? 0, limit,
        remaining: limit == null ? null : Math.max(0, limit - used),
        exhausted: Boolean(r?.exhaustedAt) || (limit != null && used >= limit),
        pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : null,
        resetsAt: (type === "day" ? day.end : month.end).toISOString(),
      };
    };
    const configured = PROVIDERS[s.provider].isConfigured();
    const daily = u("day", day.start, s.dailyLimit);
    const monthly = u("month", month.start, s.monthlyLimit);
    // Never "healthy" on credentials alone: unknown until a send or probe proves it.
    const display =
      !configured ? "not_configured"
      : !s.enabled ? "disabled"
      : daily.exhausted || monthly.exhausted ? "quota_exhausted"
      : s.healthStatus;
    return {
      provider: s.provider, priority: s.priority, enabled: s.enabled, configured,
      status: display, healthStatus: s.healthStatus,
      circuitBreakerUntil: s.circuitBreakerUntil?.toISOString() ?? null,
      consecutiveFailures: s.consecutiveFailures,
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: s.lastFailureAt?.toISOString() ?? null,
      lastErrorCode: s.lastErrorCode, lastErrorMessage: s.lastErrorMessage,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      reportedRemaining: row?.reportedRemaining ?? null,
      reportedAt: row?.reportedAt?.toISOString() ?? null,
      senderVerified: row?.senderVerified ?? null,
      daily, monthly,
      quotaLevel: Math.max(daily.pct ?? 0, monthly.pct ?? 0) >= critical ? "critical"
        : Math.max(daily.pct ?? 0, monthly.pct ?? 0) >= warning ? "warning" : "ok",
      /** Counts are our own reservations, not the provider's ledger. */
      estimated: true,
    };
  });
}

export async function getEmailSettings() {
  const row = await prisma.config.findUnique({ where: { key: PAUSE_NONCRITICAL_KEY } });
  let paused = false;
  try { paused = row ? JSON.parse(row.value) === true : false; } catch { /* default */ }
  return {
    routerEnabled: routerEnabled(),
    fallbackEnabled: fallbackEnabled(),
    pauseNoncritical: paused,
    thresholds: quotaThresholds(),
  };
}

export async function listOpenAlerts(limit = 50) {
  const rows = await prisma.emailAlert.findMany({
    where: { resolvedAt: null }, orderBy: { lastAt: "desc" }, take: limit,
  });
  const recent = await prisma.emailAlert.findMany({
    where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: "desc" }, take: 20,
  });
  const shape = (a: (typeof rows)[number]) => ({
    id: a.id, kind: a.kind, severity: a.severity, provider: a.provider, message: a.message, count: a.count,
    firstAt: a.firstAt.toISOString(), lastAt: a.lastAt.toISOString(), resolvedAt: a.resolvedAt?.toISOString() ?? null,
  });
  return { open: rows.map(shape), resolved: recent.map(shape) };
}

export interface MessageFilters {
  q?: string;
  status?: string;
  provider?: string;
  templateId?: string;
  priority?: string;
  from?: Date;
  to?: Date;
  sort?: "createdAt" | "-createdAt";
  page: number;
  pageSize: number;
}

export async function listEmailMessages(f: MessageFilters) {
  const pageSize = Math.min(Math.max(f.pageSize, 1), MAX_PAGE_SIZE);
  const where: Prisma.EmailMessageWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.provider ? { provider: f.provider } : {}),
    ...(f.templateId ? { templateId: f.templateId } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    ...(f.q
      ? {
          OR: [
            { recipientEmail: { contains: f.q.trim().toLowerCase(), mode: "insensitive" as const } },
            { userId: f.q.trim() },
            { id: f.q.trim() },
            { providerMessageId: f.q.trim() },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.findMany({
      where,
      orderBy: { createdAt: f.sort === "createdAt" ? "asc" : "desc" },
      skip: (Math.max(f.page, 1) - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, userId: true, recipientEmail: true, templateId: true, priority: true, status: true,
        provider: true, attemptCount: true, fallbackUsed: true, createdAt: true, acceptedAt: true, deliveredAt: true,
        retryCount: true, errorCode: true,
      },
    }),
  ]);
  return {
    total, page: Math.max(f.page, 1), pageSize,
    rows: rows.map((r) => ({
      id: r.id, userId: r.userId, recipient: maskEmail(r.recipientEmail), templateId: r.templateId,
      priority: r.priority, status: r.status, provider: r.provider, attempts: r.attemptCount,
      retries: r.retryCount, fallbackUsed: r.fallbackUsed, errorCode: r.errorCode,
      createdAt: r.createdAt.toISOString(),
      acceptedMs: r.acceptedAt ? r.acceptedAt.getTime() - r.createdAt.getTime() : null,
      deliveredMs: r.deliveredAt ? r.deliveredAt.getTime() - r.createdAt.getTime() : null,
    })),
  };
}

export async function getEmailMessageDetail(id: string) {
  const m = await prisma.emailMessage.findUnique({
    where: { id },
    include: { attempts: { orderBy: { attemptNumber: "asc" } } },
  });
  if (!m) return null;
  const providerIds = [m.providerMessageId, ...m.attempts.map((a) => a.providerMessageId)].filter((x): x is string => !!x);
  const webhookEvents = providerIds.length
    ? await prisma.emailWebhookEvent.findMany({
        where: { providerMessageId: { in: providerIds } }, orderBy: { receivedAt: "asc" }, take: 50,
      })
    : [];
  return {
    id: m.id,
    userId: m.userId,
    recipient: maskEmail(m.recipientEmail),
    templateId: m.templateId,
    subject: m.subject,
    priority: m.priority,
    status: m.status,
    provider: m.provider,
    providerMessageId: m.providerMessageId,
    fallbackUsed: m.fallbackUsed,
    retryCount: m.retryCount,
    nextAttemptAt: m.nextAttemptAt?.toISOString() ?? null,
    errorCode: m.errorCode,
    errorMessage: m.errorMessage,
    createdAt: m.createdAt.toISOString(),
    acceptedAt: m.acceptedAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    failedAt: m.failedAt?.toISOString() ?? null,
    hasPendingPayload: m.payloadEncrypted != null,
    attempts: m.attempts.map((a) => ({
      provider: a.provider, attemptNumber: a.attemptNumber, status: a.status, errorClass: a.errorClass,
      errorCode: a.errorCode, message: a.sanitizedErrorMessage, latencyMs: a.latencyMs,
      startedAt: a.startedAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
    })),
    events: webhookEvents.map((e) => ({
      provider: e.provider, type: e.eventType, occurredAt: e.occurredAt?.toISOString() ?? null,
      receivedAt: e.receivedAt.toISOString(),
    })),
  };
}

export function isKnownProvider(p: string): p is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(p);
}
