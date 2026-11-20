// Mailjet — POST https://api.mailjet.com/v3.1/send, HTTP Basic (key:secret).
//
// Response: { Messages: [{ Status: "success" | "error", To: [{ MessageUUID,
// MessageID }], Errors: [{ ErrorCode, StatusCode, ErrorMessage,
// ErrorRelatedTo }] }] }. Our EmailMessage id goes in CustomID, which every
// Mailjet event echoes back, and which /v3/REST/message can be searched by.
//
// Note on Mailjet's free plan: its docs say mail over the DAILY quota is
// queued and sent the next day rather than refused. For a verification code
// that is worse than a refusal, so the router's own reservation must stop at
// the configured daily limit before Mailjet ever sees an over-quota send.

import { env } from "@/lib/env";
import { PRODUCT_NAME } from "@/lib/email/tokens";
import {
  httpRequest, isAmbiguousStatus, networkOutcome, retryAfterSeconds, sanitizeError,
} from "../http";
import type { EmailProvider, ErrorClass, HealthCheckResult, OutboundEmail, SendOutcome } from "../types";

const BASE = "https://api.mailjet.com";

function senderEmail(): string | undefined {
  return env.MAILJET_SENDER_EMAIL || env.EMAIL_FROM || undefined;
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.MAILJET_API_KEY ?? ""}:${env.MAILJET_SECRET_KEY ?? ""}`).toString("base64")}`;
}

interface MjError { ErrorCode?: string; StatusCode?: number; ErrorMessage?: string; ErrorRelatedTo?: string[] }
interface MjMessage { Status?: string; To?: { MessageID?: number | string; MessageUUID?: string }[]; Errors?: MjError[] }
interface MjBody { Messages?: MjMessage[]; ErrorMessage?: string; StatusCode?: number; ErrorIdentifier?: string }

/** Exported for tests. */
export function classifyMailjet(status: number, body: unknown): { errorClass: ErrorClass; code: string; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as MjBody;
  const err = b.Messages?.[0]?.Errors?.[0];
  const code = err?.ErrorCode ?? b.ErrorIdentifier ?? `http_${status}`;
  const rawMsg = err?.ErrorMessage ?? b.ErrorMessage ?? (typeof body === "string" ? body : "");
  const msg = rawMsg.toLowerCase();
  const relatedList = (err?.ErrorRelatedTo ?? []).map((r) => r.toLowerCase());
  const related = relatedList.join(",");
  // Paths look like "To[0].Email" or "Messages[0].From.Email".
  const aboutRecipient = relatedList.some((r) => /(^|\.)(to|cc|bcc)(\[|\.|$)/.test(r));
  const aboutSender = relatedList.some((r) => /(^|\.)from(\[|\.|$)/.test(r));
  const out = (errorClass: ErrorClass) => ({ errorClass, code, message: sanitizeError(rawMsg || code) });

  if (status === 401) return out("auth");
  if (status === 429) return out("rate_limit");
  if (/suspend|blocked|deactivat|under review|account.*(locked|disabled)/.test(msg)) return out("suspended");
  if (/quota|limit.*(reached|exceeded)|credit/.test(msg)) return out("quota");
  if (status === 403) return out(/sender|from/.test(msg + related) ? "sender_config" : "auth");
  if (/sender|from.*(not|in)valid|not.*(validated|authori[sz]ed)/.test(msg) || aboutSender) {
    return out("sender_config");
  }
  if (aboutRecipient || /recipient|invalid.*email/.test(msg)) return out("recipient");
  if (isAmbiguousStatus(status)) return out("unknown_outcome");
  if (status >= 500) return out("transient");
  return out("invalid_request");
}

export const mailjetProvider: EmailProvider = {
  name: "mailjet",

  isConfigured() {
    return Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY && senderEmail());
  },

  async send(email: OutboundEmail, signal?: AbortSignal): Promise<SendOutcome> {
    // Mailjet rejects custom headers that collide with ones it sets itself,
    // so only pass through the List-Unsubscribe pair and our own X- headers.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(email.headers)) {
      if (/^(list-unsubscribe|list-unsubscribe-post|x-)/i.test(k)) headers[k] = v;
    }
    const attempt = await httpRequest(
      `${BASE}/v3.1/send`,
      {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          Messages: [
            {
              From: { Email: senderEmail(), Name: env.MAILJET_SENDER_NAME || PRODUCT_NAME },
              To: [{ Email: email.to }],
              Subject: email.subject,
              TextPart: email.text,
              HTMLPart: email.html,
              ...(email.replyTo ? { ReplyTo: { Email: email.replyTo } } : {}),
              ...(Object.keys(headers).length ? { Headers: headers } : {}),
              CustomID: email.messageId,
              ...(email.attachments?.length
                ? {
                    Attachments: email.attachments.map((a) => ({
                      ContentType: a.contentType,
                      Filename: a.filename,
                      Base64Content: a.content.toString("base64"),
                    })),
                  }
                : {}),
            },
          ],
        }),
      },
      { signal },
    );
    if (attempt.kind === "network") return networkOutcome(attempt);
    const { status, body, headers: resHeaders } = attempt.res;
    const first = (body as MjBody | null)?.Messages?.[0];

    if (status === 200 && first?.Status === "success") {
      const to = first.To?.[0];
      // MessageUUID, not MessageID: MessageID is an ~18-digit integer, above
      // 2^53, and JSON.parse rounds it to the nearest double. Two sends a few
      // ms apart (the login alert and welcome email on a first Google sign-in)
      // got adjacent ids that rounded to the SAME number, and EmailLog's
      // unique providerMessageId refused the second row (CLIPIRO-WEB-1W).
      // Webhooks carry the same value as Message_GUID.
      const id = to?.MessageUUID ?? null;
      return { ok: true, providerMessageId: id, latencyMs: attempt.latencyMs };
    }
    const c = classifyMailjet(status, body);
    return {
      ok: false,
      ...c,
      latencyMs: attempt.latencyMs,
      ...(c.errorClass === "rate_limit" ? { retryAfterSec: retryAfterSeconds(resHeaders) } : {}),
    };
  },

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.isConfigured()) {
      return { ok: false, errorClass: "auth", code: "not_configured", message: "MAILJET keys or sender not set" };
    }
    const want = senderEmail() ?? "";
    // Looking up our own sender both proves the key works and says whether
    // the from-address is validated (Status "Active").
    const r = await httpRequest(
      `${BASE}/v3/REST/sender?Email=${encodeURIComponent(want)}`,
      { method: "GET", headers: { Authorization: authHeader() } },
      { timeoutMs: 8000 },
    );
    if (r.kind === "network") return { ok: false, errorClass: "transient", code: r.code, message: "Could not reach Mailjet" };
    if (r.res.status !== 200) {
      const c = classifyMailjet(r.res.status, r.res.body);
      return { ok: false, errorClass: c.errorClass, code: c.code, message: c.message };
    }
    const data = (r.res.body as { Data?: { Status?: string }[] })?.Data ?? [];
    return { ok: true, reportedRemaining: null, senderVerified: data.length ? data.some((s) => s.Status === "Active") : null };
  },
};
