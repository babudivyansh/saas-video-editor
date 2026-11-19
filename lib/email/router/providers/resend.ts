// Resend — POST https://api.resend.com/emails, Bearer key.
//
// Same request the pre-router transport sent (lib/email/send.ts viaResend),
// plus an Idempotency-Key of our EmailMessage id: Resend dedupes a repeat
// with the same key for 24h, which makes Resend the one provider where a
// timed-out send can be safely retried against the SAME provider.
//
// Error names are Resend's documented ones (resend.com/docs/api-reference/errors):
// daily_quota_exceeded / monthly_quota_exceeded (429), rate_limit_exceeded
// (429), missing_api_key / restricted_api_key / validation_error (401/403),
// suspended_api_key (403), invalid_idempotent_request /
// concurrent_idempotent_requests (409).

import { env } from "@/lib/env";
import { PRODUCT_NAME } from "@/lib/email/tokens";
import {
  httpRequest, isAmbiguousStatus, networkOutcome, retryAfterSeconds, sanitizeError,
} from "../http";
import type { EmailProvider, ErrorClass, HealthCheckResult, OutboundEmail, SendOutcome } from "../types";

const ENDPOINT = "https://api.resend.com";

function fromAddress(): string | undefined {
  return env.RESEND_FROM_EMAIL || env.EMAIL_FROM || undefined;
}

interface ResendError { name?: string; message?: string; statusCode?: number }

/** Exported for tests. */
export function classifyResend(status: number, body: unknown): { errorClass: ErrorClass; code: string; quotaPeriod?: "day" | "month" } {
  const b = (body && typeof body === "object" ? body : {}) as ResendError;
  const code = b.name ?? `http_${status}`;
  const msg = (b.message ?? "").toLowerCase();

  if (code === "daily_quota_exceeded") return { errorClass: "quota", code, quotaPeriod: "day" };
  if (code === "monthly_quota_exceeded") return { errorClass: "quota", code, quotaPeriod: "month" };
  if (code === "rate_limit_exceeded" || status === 429) return { errorClass: "rate_limit", code };
  if (code === "suspended_api_key") return { errorClass: "suspended", code };
  if (code === "missing_api_key" || code === "restricted_api_key" || code === "invalid_api_key" || status === 401) {
    return { errorClass: "auth", code };
  }
  if (code === "concurrent_idempotent_requests") return { errorClass: "unknown_outcome", code };
  if (status === 403) {
    // 403 validation_error covers "domain not verified" and "testing-only
    // recipient" (onboarding@resend.dev can only mail the owner) — both are
    // our sender setup, not the user's address.
    if (/domain|verify|testing|own email|from/.test(msg)) return { errorClass: "sender_config", code };
    return { errorClass: "auth", code };
  }
  if (status === 422 && /\bto\b|recipient|email address/.test(msg)) return { errorClass: "recipient", code };
  if (isAmbiguousStatus(status)) return { errorClass: "unknown_outcome", code };
  if (status >= 500) return { errorClass: "transient", code };
  return { errorClass: "invalid_request", code };
}

export const resendProvider: EmailProvider = {
  name: "resend",

  isConfigured() {
    return Boolean(env.RESEND_API_KEY && fromAddress());
  },

  async send(email: OutboundEmail, signal?: AbortSignal): Promise<SendOutcome> {
    const attempt = await httpRequest(
      `${ENDPOINT}/emails`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.messageId,
        },
        body: JSON.stringify({
          from: `${PRODUCT_NAME} <${fromAddress()}>`,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
          tags: [{ name: "msg", value: email.messageId.replace(/[^A-Za-z0-9_-]/g, "") }],
          ...(email.attachments?.length
            ? {
                attachments: email.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content.toString("base64"),
                  content_type: a.contentType,
                })),
              }
            : {}),
        }),
      },
      { signal },
    );
    if (attempt.kind === "network") return networkOutcome(attempt);
    const { status, body, headers } = attempt.res;

    if (status === 200 || status === 201) {
      const id = (body as { id?: string } | null)?.id ?? null;
      return { ok: true, providerMessageId: id, latencyMs: attempt.latencyMs };
    }
    const c = classifyResend(status, body);
    return {
      ok: false,
      errorClass: c.errorClass,
      code: c.code,
      message: sanitizeError((body as ResendError | null)?.message ?? body),
      latencyMs: attempt.latencyMs,
      ...(c.quotaPeriod ? { quotaPeriod: c.quotaPeriod } : {}),
      ...(c.errorClass === "rate_limit" ? { retryAfterSec: retryAfterSeconds(headers) } : {}),
    };
  },

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.isConfigured()) {
      return { ok: false, errorClass: "auth", code: "not_configured", message: "RESEND_API_KEY or from-address not set" };
    }
    const r = await httpRequest(
      `${ENDPOINT}/domains`,
      { method: "GET", headers: { Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}` } },
      { timeoutMs: 8000 },
    );
    if (r.kind === "network") return { ok: false, errorClass: "transient", code: r.code, message: "Could not reach Resend" };
    const body = r.res.body as ResendError & { data?: { name?: string; status?: string }[] };
    // A sending-only key cannot list domains — but getting that specific
    // refusal proves the key itself is valid.
    if (body?.name === "restricted_api_key") return { ok: true, reportedRemaining: null, senderVerified: null };
    if (r.res.status !== 200) {
      const c = classifyResend(r.res.status, body);
      return { ok: false, errorClass: c.errorClass, code: c.code, message: sanitizeError(body?.message ?? body) };
    }
    const domain = fromAddress()?.split("@")[1]?.toLowerCase();
    const d = body.data?.find((x) => x.name?.toLowerCase() === domain);
    return { ok: true, reportedRemaining: null, senderVerified: d ? d.status === "verified" : false };
  },
};
