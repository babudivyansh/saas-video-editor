// Operational alerts for email delivery.
//
// Three channels, none of them email:
//   1. An EmailAlert row — the Alerts panel on Admin → Email.
//   2. An in-app notification to every admin, only when an alert OPENS (not
//      on every repeat), so a provider failing 500 times is one bell entry.
//   3. logger.error / warn, which reaches Sentry — the independent channel
//      that still works when every email provider is down.
//
// Sending "email is broken" by email would go through the same broken
// providers and, on failure, raise another alert — so it is never done.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notify";
import type { ProviderName } from "./types";

export type AlertKind =
  | "provider_unavailable"
  | "provider_suspended"
  | "provider_misconfigured"
  | "fallback_active"
  | "all_providers_unavailable"
  | "quota_warning"
  | "quota_critical"
  | "quota_exhausted"
  | "otp_spike"
  | "bounce_rate_high"
  | "webhook_failures"
  | "retry_backlog";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertInput {
  kind: AlertKind;
  severity: AlertSeverity;
  provider?: ProviderName | null;
  message: string;
  /** Same key = same alert. Defaults to kind + provider. */
  dedupeKey?: string;
}

export interface AlertSink {
  raise(a: AlertInput): Promise<void>;
  resolve(dedupeKey: string): Promise<void>;
}

export function alertKey(kind: AlertKind, provider?: ProviderName | null, suffix?: string): string {
  return [kind, provider ?? "all", suffix].filter(Boolean).join(":");
}

export const dbAlertSink: AlertSink = {
  async raise(a) {
    const dedupeKey = a.dedupeKey ?? alertKey(a.kind, a.provider);
    const log = a.severity === "critical" ? logger.error : logger.warn;
    try {
      const existing = await prisma.emailAlert.findUnique({ where: { dedupeKey } });
      const now = new Date();
      if (existing && !existing.resolvedAt) {
        await prisma.emailAlert.update({
          where: { dedupeKey },
          data: { count: { increment: 1 }, lastAt: now, message: a.message, severity: a.severity },
        });
        return; // already open: no new notification, no log spam
      }
      await prisma.emailAlert.upsert({
        where: { dedupeKey },
        create: { dedupeKey, kind: a.kind, severity: a.severity, provider: a.provider ?? null, message: a.message },
        update: { resolvedAt: null, count: 1, firstAt: now, lastAt: now, message: a.message, severity: a.severity },
      });
      log("email:alert", `${a.kind}${a.provider ? ` [${a.provider}]` : ""}: ${a.message}`);
      if (a.severity !== "info") {
        await notifyAdmins("admin_email_alert", `Email: ${a.message}`, undefined, "/admin/email?tab=alerts", {
          kind: a.kind,
          provider: a.provider ?? null,
        });
      }
    } catch (err) {
      // An alert that cannot be stored still reaches Sentry.
      logger.error("email:alert", `could not record ${a.kind}: ${a.message}`, err);
    }
  },

  async resolve(dedupeKey) {
    try {
      await prisma.emailAlert.updateMany({ where: { dedupeKey, resolvedAt: null }, data: { resolvedAt: new Date() } });
    } catch (err) {
      logger.warn("email:alert", `could not resolve ${dedupeKey}`, err);
    }
  },
};

/** For tests and for code paths that must not alert. */
export function memoryAlertSink() {
  const raised: AlertInput[] = [];
  const resolved: string[] = [];
  return {
    raised,
    resolved,
    async raise(a: AlertInput) { raised.push(a); },
    async resolve(k: string) { resolved.push(k); },
  } satisfies AlertSink & { raised: AlertInput[]; resolved: string[] };
}
