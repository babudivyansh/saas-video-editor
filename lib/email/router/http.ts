// HTTP plumbing shared by the provider adapters.
//
// The one subtle job here is telling apart two kinds of network failure:
//
//   • The request never reached the provider (DNS failure, connection
//     refused, TLS handshake failed). Nothing was sent, so trying the next
//     provider is safe.
//   • The request may have reached it (our timeout fired while waiting for the
//     response, the socket reset mid-flight). The provider may have accepted
//     the email. Sending it again elsewhere would deliver a SECOND verification
//     code or a second receipt — so this is "unknown_outcome", and the router
//     stops instead of falling back.

import type { ErrorClass, SendOutcome } from "./types";

export const SEND_TIMEOUT_MS = 10_000;

/** undici error codes that mean the request was never transmitted. */
const PRE_SEND_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export interface HttpResult {
  status: number;
  /** Parsed JSON when the body is JSON, else the raw text (truncated). */
  body: unknown;
  headers: Headers;
}

export type HttpAttempt =
  | { kind: "response"; res: HttpResult; latencyMs: number }
  | { kind: "network"; errorClass: Extract<ErrorClass, "transient" | "unknown_outcome">; code: string; latencyMs: number };

function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string } };
    if (e.name === "AbortError" || e.name === "TimeoutError") return "timeout";
    return e.cause?.code ?? e.code ?? e.cause?.name ?? e.name ?? "network_error";
  }
  return "network_error";
}

/** Classify a thrown fetch error. Exported for tests. */
export function classifyNetworkError(err: unknown): { errorClass: "transient" | "unknown_outcome"; code: string } {
  const code = errorCode(err);
  return { errorClass: PRE_SEND_CODES.has(code) ? "transient" : "unknown_outcome", code };
}

export async function httpRequest(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string },
  opts: { timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<HttpAttempt> {
  const started = Date.now();
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? SEND_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const r = await doFetch(url, { ...init, signal });
    const raw = await r.text().catch(() => "");
    let body: unknown = raw.slice(0, 2000);
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* keep text */
    }
    return { kind: "response", res: { status: r.status, body, headers: r.headers }, latencyMs: Date.now() - started };
  } catch (err) {
    const { errorClass, code } = classifyNetworkError(err);
    return { kind: "network", errorClass, code, latencyMs: Date.now() - started };
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Long opaque tokens: API keys, bearer tokens, signed URLs' signatures.
const TOKEN_RE = /\b(?:xkeysib-|re_|sk_|whsec_)?[A-Za-z0-9_-]{32,}\b/g;
const URL_RE = /https?:\/\/\S+/gi;

/**
 * Make a provider's error text safe to store and show on the admin page:
 * no recipient addresses, no keys, no URLs (a reset link is a credential),
 * no 6-digit runs (an OTP could be echoed back in a validation error).
 */
export function sanitizeError(text: unknown): string {
  const s = typeof text === "string" ? text : JSON.stringify(text ?? "");
  return s
    .replace(URL_RE, "[url]")
    .replace(EMAIL_RE, "[email]")
    .replace(TOKEN_RE, "[redacted]")
    .replace(/\b\d{6}\b/g, "[code]")
    .slice(0, 300);
}

export function networkOutcome(a: Extract<HttpAttempt, { kind: "network" }>): SendOutcome {
  return {
    ok: false,
    errorClass: a.errorClass,
    code: a.code,
    message:
      a.errorClass === "unknown_outcome"
        ? "No response from provider; the email may or may not have been accepted"
        : "Could not reach provider; nothing was sent",
    latencyMs: a.latencyMs,
  };
}

export function retryAfterSeconds(headers: Headers): number | undefined {
  const v = headers.get("retry-after");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3600) : undefined;
}

/** 502/504 come from a gateway that may have forwarded the request: ambiguous. */
export function isAmbiguousStatus(status: number): boolean {
  return status === 502 || status === 504;
}
