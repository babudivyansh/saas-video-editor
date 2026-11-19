// Everything the router needs done on a timer. Run by
// /api/cron/email-maintenance every 5 minutes.
//
//  1. retry deferred non-critical mail that is due
//  2. settle sends stuck mid-flight (process died) as "unknown" — never resend
//  3. health-probe providers that are out (cooldown elapsed) or not checked
//     recently; a pass brings them back. Never clears a suspension.
//  4. evaluate alert thresholds (quota, OTP spike, bounce rate, webhook
//     failures, retry backlog)
//  5. prune old rows (hourly)

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isSuppressed } from "@/lib/email/suppression";
import { quotaThresholds } from "./config";
import { alertKey, dbAlertSink, type AlertSink } from "./alerts";
import { PROVIDERS, processDeferred } from "./deliver";
import { dayPeriod, monthPeriod } from "./periods";
import { prismaRouterStore } from "./store";
import type { EmailProvider, ProviderName } from "./types";

const STALL_MS = 15 * 60_000;
const PROBE_EVERY_MS = 6 * 60 * 60_000;
export const RETENTION_DAYS = { messages: 90, webhookEvents: 30, alerts: 90, quota: 400 };

/** Run a read-only health check and record it. Exported for the admin "test" button. */
export async function probeProvider(provider: EmailProvider, now = new Date()) {
  const r = await provider.healthCheck();
  const [state] = (await prismaRouterStore.getProviderStates()).filter((s) => s.provider === provider.name);
  const base = {
    lastCheckedAt: now,
    ...(r.reportedRemaining !== undefined ? { reportedRemaining: r.reportedRemaining, reportedAt: now } : {}),
    ...(r.senderVerified !== undefined ? { senderVerified: r.senderVerified } : {}),
  };
  if (r.ok) {
    // A suspension is lifted by the provider and then cleared by a person —
    // a passing credentials check is not evidence that it was lifted.
    const recover = state?.healthStatus !== "suspended" && state?.healthStatus !== "quota_exhausted";
    await prismaRouterStore.updateProviderState(provider.name, {
      ...base,
      ...(recover ? { healthStatus: "healthy", consecutiveFailures: 0, circuitBreakerUntil: null } : {}),
    });
    if (recover) await dbAlertSink.resolve(alertKey("provider_misconfigured", provider.name));
  } else {
    await prismaRouterStore.updateProviderState(provider.name, {
      ...base,
      lastErrorCode: r.code ?? null,
      lastErrorMessage: r.message ?? null,
      ...(r.errorClass === "auth" || r.errorClass === "sender_config" ? { healthStatus: "misconfigured" } : {}),
      ...(r.errorClass === "suspended" ? { healthStatus: "suspended" } : {}),
    });
  }
  return r;
}

async function settleStalled(now: Date): Promise<number> {
  const r = await prisma.emailMessage.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(now.getTime() - STALL_MS) } },
    data: { status: "unknown", errorCode: "stalled", errorMessage: "Process stopped mid-send; not resent to avoid a duplicate" },
  });
  return r.count;
}

async function probeDue(now: Date): Promise<ProviderName[]> {
  const probed: ProviderName[] = [];
  const states = await prismaRouterStore.getProviderStates();
  const checked = await prisma.emailProviderStatus.findMany({ select: { provider: true, lastCheckedAt: true } });
  for (const s of states) {
    const provider = PROVIDERS[s.provider];
    if (!s.enabled || !provider.isConfigured() || s.healthStatus === "suspended") continue;
    const last = checked.find((c) => c.provider === s.provider)?.lastCheckedAt;
    const outAndCooled = (s.healthStatus === "misconfigured" || s.healthStatus === "unavailable") &&
      (!s.circuitBreakerUntil || s.circuitBreakerUntil <= now);
    const stale = !last || now.getTime() - last.getTime() > PROBE_EVERY_MS;
    if (outAndCooled || stale) {
      try {
        await probeProvider(provider, now);
        probed.push(s.provider);
      } catch (err) {
        logger.warn("email:maintenance", `probe of ${s.provider} threw`, err);
      }
    }
  }
  return probed;
}

/** Quota usage alerts and clearing a stale "quota_exhausted" label once a period rolls over. */
export async function evaluateQuota(now: Date, alerts: AlertSink = dbAlertSink): Promise<void> {
  const { warning, critical } = quotaThresholds();
  const day = dayPeriod(now);
  const month = monthPeriod(now);
  const states = await prismaRouterStore.getProviderStates();
  const rows = await prisma.emailQuotaUsage.findMany({
    where: { periodStart: { in: [day.start, month.start] } },
  });
  for (const s of states) {
    if (!s.enabled || !PROVIDERS[s.provider].isConfigured()) continue;
    let exhaustedNow = false;
    for (const [period, limit] of [[day, s.dailyLimit], [month, s.monthlyLimit]] as const) {
      const row = rows.find((r) => r.provider === s.provider && r.periodType === period.type && r.periodStart.getTime() === period.start.getTime());
      if (row?.exhaustedAt) exhaustedNow = true;
      if (!limit || !row) continue;
      const pct = (row.reservedCount / limit) * 100;
      if (pct >= 100) exhaustedNow = true;
      const stamp = period.start.toISOString().slice(0, period.type === "day" ? 10 : 7);
      const label = period.type === "day" ? "daily" : "monthly";
      if (pct >= critical) {
        await alerts.raise({
          kind: "quota_critical", severity: "critical", provider: s.provider,
          message: `${s.provider} has used ${Math.round(pct)}% of its ${label} quota (${row.reservedCount}/${limit})`,
          dedupeKey: alertKey("quota_critical", s.provider, `${period.type}:${stamp}`),
        });
      } else if (pct >= warning) {
        await alerts.raise({
          kind: "quota_warning", severity: "warning", provider: s.provider,
          message: `${s.provider} has used ${Math.round(pct)}% of its ${label} quota (${row.reservedCount}/${limit})`,
          dedupeKey: alertKey("quota_warning", s.provider, `${period.type}:${stamp}`),
        });
      }
    }
    if (s.healthStatus === "quota_exhausted" && !exhaustedNow) {
      await prismaRouterStore.updateProviderState(s.provider, { healthStatus: "unknown" });
    }
  }
}

/** OTP spike, bounce rate, webhook failures, retry backlog. */
export async function evaluateTraffic(now: Date, alerts: AlertSink = dbAlertSink): Promise<void> {
  const hourAgo = new Date(now.getTime() - 3600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const hourStamp = now.toISOString().slice(0, 13);

  const [otpHour, otpDay, outcomes, stuckWebhooks, deferred] = await Promise.all([
    prisma.emailMessage.count({ where: { templateId: "otp", createdAt: { gte: hourAgo } } }),
    prisma.emailMessage.count({ where: { templateId: "otp", createdAt: { gte: dayAgo, lt: hourAgo } } }),
    prisma.emailMessage.groupBy({ by: ["status"], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } }),
    prisma.emailWebhookEvent.count({ where: { processedAt: null, receivedAt: { lt: new Date(now.getTime() - 10 * 60_000), gte: dayAgo } } }),
    prisma.emailMessage.aggregate({ where: { status: "deferred", nextAttemptAt: { not: null } }, _count: { _all: true }, _min: { createdAt: true } }),
  ]);

  // Abnormal OTP traffic: 5× the trailing hourly average, with a floor so a
  // quiet site doesn't alert on its first busy hour.
  const avg = otpDay / 23;
  if (otpHour >= Math.max(60, avg * 5)) {
    await alerts.raise({
      kind: "otp_spike", severity: "warning",
      message: `${otpHour} verification-code emails in the last hour (usual ≈ ${Math.round(avg)}/h) — possible abuse`,
      dedupeKey: alertKey("otp_spike", null, hourStamp),
    });
  }

  const count = (s: string) => outcomes.find((o) => o.status === s)?._count._all ?? 0;
  const bounced = count("bounced") + count("complained");
  const settled = bounced + count("accepted") + count("delivered");
  if (settled >= 20 && bounced / settled > 0.05) {
    await alerts.raise({
      kind: "bounce_rate_high", severity: "warning",
      message: `${((bounced / settled) * 100).toFixed(1)}% of the last 24h's email bounced or was marked spam (${bounced}/${settled})`,
      dedupeKey: alertKey("bounce_rate_high", null, now.toISOString().slice(0, 10)),
    });
  }

  if (stuckWebhooks >= 5) {
    await alerts.raise({
      kind: "webhook_failures", severity: "warning",
      message: `${stuckWebhooks} delivery webhooks failed to process in the last 24h`,
      dedupeKey: alertKey("webhook_failures", null, now.toISOString().slice(0, 10)),
    });
  }

  const backlog = deferred._count._all;
  const oldest = deferred._min.createdAt;
  if (backlog >= 100 || (oldest && now.getTime() - oldest.getTime() > 6 * 3600_000)) {
    await alerts.raise({
      kind: "retry_backlog", severity: "warning",
      message: `${backlog} emails waiting to retry${oldest ? `, oldest from ${oldest.toISOString()}` : ""}`,
      dedupeKey: alertKey("retry_backlog", null, hourStamp),
    });
  }
}

async function prune(now: Date): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const [m, w, a, q] = await Promise.all([
    prisma.emailMessage.deleteMany({ where: { createdAt: { lt: ago(RETENTION_DAYS.messages) } } }),
    prisma.emailWebhookEvent.deleteMany({ where: { receivedAt: { lt: ago(RETENTION_DAYS.webhookEvents) } } }),
    prisma.emailAlert.deleteMany({ where: { resolvedAt: { lt: ago(RETENTION_DAYS.alerts) } } }),
    prisma.emailQuotaUsage.deleteMany({ where: { periodEnd: { lt: ago(RETENTION_DAYS.quota) } } }),
  ]);
  return { messages: m.count, webhookEvents: w.count, alerts: a.count, quota: q.count };
}

export async function runEmailMaintenance(now = new Date()) {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (err) {
      logger.error("email:maintenance", `${name} failed`, err);
      out[name] = { error: true };
    }
  };
  await step("stalled", () => settleStalled(now));
  await step("retries", () => processDeferred({ isSuppressed }));
  await step("probed", () => probeDue(now));
  await step("quota", () => evaluateQuota(now));
  await step("traffic", () => evaluateTraffic(now));
  if (now.getUTCMinutes() < 5) await step("pruned", () => prune(now));
  return out;
}
