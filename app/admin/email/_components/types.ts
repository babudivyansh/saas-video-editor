// Shapes of the Admin → Email API responses (app/api/admin/email/*).

export type ProviderName = "brevo" | "mailjet" | "resend";
export type Headers = () => Record<string, string>;

export interface QuotaUsage {
  used: number;
  accepted: number;
  rejected: number;
  limit: number | null;
  remaining: number | null;
  exhausted: boolean;
  pct: number | null;
  resetsAt: string;
}

export interface ProviderCard {
  provider: ProviderName;
  priority: number;
  enabled: boolean;
  configured: boolean;
  status: string;
  healthStatus: string;
  circuitBreakerUntil: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastCheckedAt: string | null;
  reportedRemaining: number | null;
  reportedAt: string | null;
  senderVerified: boolean | null;
  daily: QuotaUsage;
  monthly: QuotaUsage;
  quotaLevel: "ok" | "warning" | "critical";
  estimated: boolean;
}

export interface EmailAlertRow {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  provider: ProviderName | null;
  message: string;
  count: number;
  firstAt: string;
  lastAt: string;
  resolvedAt: string | null;
}

export interface EmailOverview {
  range: { from: string; to: string; granularity: "hour" | "day" };
  totals: {
    attempted: number;
    accepted: number;
    delivered: number;
    failed: number;
    bounced: number;
    deferred: number;
    unknown: number;
    awaitingConfirmation: number;
    deliveryRate: number | null;
    acceptanceRate: number | null;
    fallbackRate: number | null;
    avgApiLatencyMs: number | null;
  };
  series: { t: string; total: number; accepted: number; delivered: number; failed: number; fallback: number }[];
  byProvider: { provider: ProviderName; accepted: number }[];
  byTemplate: { templateId: string; count: number }[];
  byPriority: { priority: "critical" | "high" | "normal"; count: number }[];
  providers: ProviderCard[];
  settings: { routerEnabled: boolean; fallbackEnabled: boolean; pauseNoncritical: boolean; thresholds: { warning: number; critical: number } };
  alerts: { open: EmailAlertRow[]; resolved: EmailAlertRow[] };
}

export interface MessageRow {
  id: string;
  userId: string | null;
  recipient: string;
  templateId: string;
  priority: string;
  status: string;
  provider: ProviderName | null;
  attempts: number;
  retries: number;
  fallbackUsed: boolean;
  errorCode: string | null;
  createdAt: string;
  acceptedMs: number | null;
  deliveredMs: number | null;
}

export interface MessageDetail {
  id: string;
  userId: string | null;
  recipient: string;
  templateId: string;
  subject: string;
  priority: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  fallbackUsed: boolean;
  retryCount: number;
  nextAttemptAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  hasPendingPayload: boolean;
  attempts: {
    provider: string; attemptNumber: number; status: string; errorClass: string | null; errorCode: string | null;
    message: string | null; latencyMs: number | null; startedAt: string; completedAt: string | null;
  }[];
  events: { provider: string; type: string; occurredAt: string | null; receivedAt: string }[];
}

export const PROVIDER_LABEL: Record<ProviderName, string> = { brevo: "Brevo", mailjet: "Mailjet", resend: "Resend" };

export type Tone = "success" | "warning" | "error" | "info" | "primary" | "neutral";

export function statusTone(s: string): Tone {
  if (s === "delivered" || s === "healthy") return "success";
  if (s === "accepted") return "primary";
  if (s === "deferred" || s === "degraded" || s === "rate_limited" || s === "quota_exhausted" || s === "unknown" || s === "sending") return "warning";
  if (s === "failed" || s === "bounced" || s === "complained" || s === "unavailable" || s === "misconfigured" || s === "suspended") return "error";
  return "neutral";
}

export const STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unavailable: "Unavailable",
  rate_limited: "Rate limited",
  quota_exhausted: "Quota exhausted — temporarily unavailable",
  misconfigured: "Misconfigured",
  suspended: "Suspended",
  unknown: "Not yet verified",
  not_configured: "Not configured",
  disabled: "Disabled",
};

export function ms(v: number | null): string {
  if (v == null) return "—";
  if (v < 1000) return `${v} ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(1)} s`;
  return `${Math.round(v / 60_000)} min`;
}

export function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
