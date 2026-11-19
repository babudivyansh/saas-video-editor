// Brevo transactional email — POST https://api.brevo.com/v3/smtp/email.
//
// Auth is the `api-key` header. Success is 201 { messageId }. Brevo documents
// error bodies as { code, message } with codes such as unauthorized,
// not_enough_credits, permission_denied, duplicate_request; in practice it
// also answers 401/402/403/429, so both the status and the code are checked.
//
// Our EmailMessage id goes in `tags`, so a Brevo webhook (which echoes tags)
// can be matched to the message even if the messageId were missing.

import { env } from "@/lib/env";
import { PRODUCT_NAME } from "@/lib/email/tokens";
import {
  httpRequest, isAmbiguousStatus, networkOutcome, retryAfterSeconds, sanitizeError,
} from "../http";
import type { EmailProvider, ErrorClass, HealthCheckResult, OutboundEmail, SendOutcome } from "../types";

const BASE = "https://api.brevo.com/v3";

function senderEmail(): string | undefined {
  return env.BREVO_SENDER_EMAIL || env.EMAIL_FROM || undefined;
}

interface BrevoError { code?: string; message?: string }

/** Exported for tests. */
export function classifyBrevo(status: number, body: unknown): { errorClass: ErrorClass; code: string } {
  const b = (body && typeof body === "object" ? body : {}) as BrevoError;
  const code = (b.code ?? `http_${status}`).toLowerCase();
  const msg = (b.message ?? "").toLowerCase();

  if (status === 401 || code === "unauthorized" || code === "invalid_api_key") return { errorClass: "auth", code };
  if (status === 402 || code === "not_enough_credits" || /credit|quota|limit exceeded/.test(msg)) {
    return { errorClass: "quota", code };
  }
  if (status === 429) return { errorClass: "rate_limit", code };
  if (code === "account_under_validation" || /suspend|blocked account|account.*(disabled|deactivated)/.test(msg)) {
    return { errorClass: "suspended", code };
  }
  if (status === 403 || code === "permission_denied") {
    // 403 is IP-allowlist / sender permission trouble: ours to fix, not the recipient's.
    return { errorClass: /sender|domain/.test(msg) ? "sender_config" : "auth", code };
  }
  if (/sender.*(not valid|invalid|not verified|not authori)/.test(msg)) return { errorClass: "sender_config", code };
  if (/(invalid|not valid).*(email|recipient)|(email|recipient).*(invalid|not valid|blacklist|blocked)/.test(msg)) {
    return { errorClass: "recipient", code };
  }
  if (code === "duplicate_request") return { errorClass: "unknown_outcome", code };
  if (isAmbiguousStatus(status)) return { errorClass: "unknown_outcome", code };
  if (status >= 500) return { errorClass: "transient", code };
  return { errorClass: "invalid_request", code };
}

export const brevoProvider: EmailProvider = {
  name: "brevo",

  isConfigured() {
    return Boolean(env.BREVO_API_KEY && senderEmail());
  },

  async send(email: OutboundEmail, signal?: AbortSignal): Promise<SendOutcome> {
    const attempt = await httpRequest(
      `${BASE}/smtp/email`,
      {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail(), name: env.BREVO_SENDER_NAME || PRODUCT_NAME },
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
          headers: { ...email.headers, "X-Clipiro-Message-Id": email.messageId },
          tags: [email.templateId, `msg:${email.messageId}`],
          ...(email.attachments?.length
            ? { attachment: email.attachments.map((a) => ({ name: a.filename, content: a.content.toString("base64") })) }
            : {}),
        }),
      },
      { signal },
    );
    if (attempt.kind === "network") return networkOutcome(attempt);
    const { status, body, headers } = attempt.res;

    if (status === 201 || status === 200 || status === 202) {
      const id = (body as { messageId?: string } | null)?.messageId ?? null;
      return { ok: true, providerMessageId: id, latencyMs: attempt.latencyMs };
    }
    const { errorClass, code } = classifyBrevo(status, body);
    return {
      ok: false,
      errorClass,
      code,
      message: sanitizeError((body as BrevoError | null)?.message ?? body),
      latencyMs: attempt.latencyMs,
      ...(errorClass === "quota" ? { quotaPeriod: "day" as const } : {}),
      ...(errorClass === "rate_limit" ? { retryAfterSec: retryAfterSeconds(headers) } : {}),
    };
  },

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.isConfigured()) return { ok: false, errorClass: "auth", code: "not_configured", message: "BREVO_API_KEY or sender not set" };
    const headers = { "api-key": env.BREVO_API_KEY ?? "", Accept: "application/json" };
    const acct = await httpRequest(`${BASE}/account`, { method: "GET", headers }, { timeoutMs: 8000 });
    if (acct.kind === "network") return { ok: false, errorClass: "transient", code: acct.code, message: "Could not reach Brevo" };
    if (acct.res.status !== 200) {
      const c = classifyBrevo(acct.res.status, acct.res.body);
      return { ok: false, ...c, message: sanitizeError((acct.res.body as BrevoError | null)?.message ?? acct.res.body) };
    }
    // plan: [{ type, credits, creditsType: "sendLimit" | … }]
    const plans = ((acct.res.body as { plan?: { credits?: number; creditsType?: string }[] })?.plan ?? []);
    const sendPlan = plans.find((p) => p.creditsType === "sendLimit") ?? plans[0];
    const reportedRemaining = typeof sendPlan?.credits === "number" ? sendPlan.credits : null;

    let senderVerified: boolean | null = null;
    const senders = await httpRequest(`${BASE}/senders`, { method: "GET", headers }, { timeoutMs: 8000 });
    if (senders.kind === "response" && senders.res.status === 200) {
      const list = (senders.res.body as { senders?: { email?: string; active?: boolean }[] })?.senders ?? [];
      const want = senderEmail()?.toLowerCase();
      const domain = want?.split("@")[1];
      const match = list.find((s) => s.email?.toLowerCase() === want) ??
        list.find((s) => s.email?.toLowerCase().endsWith(`@${domain}`));
      // No listed sender is "unknown", not "unverified": an authenticated
      // domain lets any address on it send without a sender entry.
      senderVerified = match ? match.active !== false : null;
    }
    return { ok: true, reportedRemaining, senderVerified };
  },
};
