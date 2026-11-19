// Provider-independent shapes for the multi-provider email router.
//
// Every provider adapter turns one OutboundEmail into one SendOutcome, and
// classifies its own failures into ErrorClass — the router decides what to do
// next from the class alone, never from a provider's raw status code.

export const PROVIDER_NAMES = ["brevo", "mailjet", "resend"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(v: unknown): v is ProviderName {
  return typeof v === "string" && (PROVIDER_NAMES as readonly string[]).includes(v);
}

export type EmailPriority = "critical" | "high" | "normal";

export interface OutboundAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** One rendered email, ready for any provider. */
export interface OutboundEmail {
  /** Our EmailMessage id — sent as the provider's custom id / tag / idempotency key. */
  messageId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  replyTo?: string;
  attachments?: OutboundAttachment[];
  templateId: string;
}

/**
 * Why a send failed, as the router needs to know it.
 *
 *  auth            key wrong/revoked              → provider misconfigured, fall back
 *  quota           daily/monthly allowance spent  → mark exhausted for the period, fall back
 *  rate_limit      too many requests per second   → short cooldown, fall back
 *  transient       5xx / connection refused       → counts toward the breaker, fall back
 *  recipient       the ADDRESS is bad             → stop: every provider would refuse it
 *  sender_config   from-address/domain unverified → provider misconfigured, fall back
 *  suspended       account/key suspended          → provider disabled until an admin clears it
 *  unknown_outcome timed out after sending        → STOP: it may have gone out; no second send
 *  invalid_request payload refused                → fall back (another provider may take it)
 */
export type ErrorClass =
  | "auth"
  | "quota"
  | "rate_limit"
  | "transient"
  | "recipient"
  | "sender_config"
  | "suspended"
  | "unknown_outcome"
  | "invalid_request";

export type SendOutcome =
  | { ok: true; providerMessageId: string | null; latencyMs: number }
  | {
      ok: false;
      errorClass: ErrorClass;
      /** Short machine code: provider's own error name, or "http_503", "timeout"… */
      code: string;
      /** Already sanitized: no keys, no recipient, ≤ 300 chars. */
      message: string;
      latencyMs: number;
      /** For quota: which allowance ran out, when the provider says. */
      quotaPeriod?: "day" | "month";
      /** For rate_limit: seconds the provider asked us to wait. */
      retryAfterSec?: number;
    };

export interface HealthCheckResult {
  ok: boolean;
  /** Present when the provider exposes remaining credits. */
  reportedRemaining?: number | null;
  senderVerified?: boolean | null;
  errorClass?: ErrorClass;
  code?: string;
  message?: string;
}

export interface EmailProvider {
  readonly name: ProviderName;
  /** Credentials and a sender address are present. Says nothing about health. */
  isConfigured(): boolean;
  send(email: OutboundEmail, signal?: AbortSignal): Promise<SendOutcome>;
  /** Read-only connectivity/credential check — never sends an email. */
  healthCheck(): Promise<HealthCheckResult>;
}
