// Low-level Submagic HTTP client. The ONLY module in the app that knows the
// Submagic API key exists, and the only one that calls api.submagic.co.
//
// Everything above it (SubmagicAdapter -> CaptionRenderer -> AutoClip) is
// provider-agnostic, so replacing Submagic with Shotstack/Creatomate/a native
// renderer means writing a sibling of this file and nothing else (§43).
//
// Three things here exist specifically because renders cost money:
//
//  1. Paid calls (create/export) are classified differently from reads on an
//     inconclusive failure — see SubmagicErrors.ts. `withRetry` is given an
//     `isRetryable` that only ever retries `safe_to_retry`, so a lost response
//     to a create is NEVER silently re-POSTed.
//  2. A Redis token bucket throttles paid calls. Deliberately NOT BullMQ's
//     limiter: production runs RENDER_QUEUE_DRIVER=in-process (see .env and
//     lib/job-queue.ts's own comment), where BullMQ rate limiting does not
//     exist. Throttling here works under both drivers.
//  3. A circuit breaker, same shape as lib/gpu-service.ts's, so an outage
//     doesn't cost every queued clip a full timeout before falling back.

import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/with-retry";
import {
  SubmagicError,
  classifyHttpStatus,
  classifyTransportError,
  isRetryable,
  type SubmagicCallKind,
} from "./SubmagicErrors";
import type {
  SubmagicCreateProjectRequest,
  SubmagicErrorBody,
  SubmagicLanguagesResponse,
  SubmagicProject,
  SubmagicRateLimitSnapshot,
  SubmagicTemplatesResponse,
  SubmagicWord,
} from "./SubmagicTypes";

const DEFAULT_BASE_URL = "https://api.submagic.co";
const READ_TIMEOUT_MS = 20_000;
const PAID_TIMEOUT_MS = 60_000;
/** Guards against a hostile/broken response body eating memory. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export function isSubmagicConfigured(): boolean {
  return Boolean(env.SUBMAGIC_API_KEY);
}

function baseUrl(): string {
  return (env.SUBMAGIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

// ── Circuit breaker ─────────────────────────────────────────────────────────

const BREAKER_KEY = "submagic:breaker";
const BREAKER_FAILS_KEY = "submagic:breaker:fails";
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_SEC = 10 * 60;

export async function isBreakerOpen(): Promise<boolean> {
  try {
    return (await redis.get(BREAKER_KEY)) !== null;
  } catch {
    return false; // Redis being down is not evidence the provider is down.
  }
}

async function recordFailure(): Promise<void> {
  try {
    const fails = await redis.incrWithExpire(BREAKER_FAILS_KEY, BREAKER_OPEN_SEC);
    if (fails >= BREAKER_THRESHOLD) {
      await redis.set(BREAKER_KEY, "1", "EX", BREAKER_OPEN_SEC);
      logger.error("submagic", `circuit breaker OPEN after ${fails} consecutive transport failures`);
    }
  } catch { /* non-fatal */ }
}

async function recordSuccess(): Promise<void> {
  try { await redis.del(BREAKER_FAILS_KEY); } catch { /* non-fatal */ }
}

// ── Rate limiting ───────────────────────────────────────────────────────────
//
// The account-wide limit observed on the live API is 1000 requests/hour
// (x-ratelimit-limit, window ~3600s). The per-endpoint limit for project
// creation is NOT documented and has been reported inconsistently, so the
// default here is a conservative 20/60s and is env-tunable. Reads are not
// throttled — they're cheap and the sweep depends on them.

const RATE_KEY = "submagic:ratelimit:create";

function rateMax(): number {
  const n = parseInt(env.SUBMAGIC_CREATE_RATE_MAX ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function rateWindowSec(): number {
  const n = parseInt(env.SUBMAGIC_CREATE_RATE_DURATION ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/**
 * Fixed-window counter, same primitive lib/rate-limit.ts uses.
 *
 * Fails OPEN when Redis is unavailable: refusing every paid render because the
 * cache is down would be a worse outage than briefly exceeding a soft limit,
 * and the provider enforces its own limit with a 429 we treat as retryable.
 */
async function acquireCreateSlot(): Promise<void> {
  const max = rateMax();
  try {
    const used = await redis.incrWithExpire(RATE_KEY, rateWindowSec());
    if (used > max) {
      throw new SubmagicError(
        `local rate limit reached (${used}/${max} per ${rateWindowSec()}s)`,
        "safe_to_retry",
        "RATE_LIMITED",
      );
    }
  } catch (err) {
    if (err instanceof SubmagicError) throw err;
    logger.warn("submagic", "rate-limit counter unavailable, allowing the call");
  }
}

/** Parsed from headers we verified exist. Used to log when we're near the cap. */
function readRateLimit(res: Response): SubmagicRateLimitSnapshot {
  const num = (h: string) => {
    const v = res.headers.get(h);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    limit: num("x-ratelimit-limit"),
    remaining: num("x-ratelimit-remaining"),
    resetAt: num("x-ratelimit-reset"),
  };
}

// ── Core request ────────────────────────────────────────────────────────────

interface RequestOpts {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  kind: SubmagicCallKind;
}

/**
 * One request, classified, retried only when provably safe.
 *
 * The API key goes in a header and is never logged, never returned in an error
 * message, and never reaches the client — errors carry only the status and a
 * truncated body.
 */
async function request<T>({ method, path, body, kind }: RequestOpts): Promise<T> {
  if (!isSubmagicConfigured()) {
    throw new SubmagicError("Submagic is not configured", "permanent", "UNAUTHORIZED");
  }

  const url = `${baseUrl()}${path}`;
  const timeoutMs = kind === "paid" ? PAID_TIMEOUT_MS : READ_TIMEOUT_MS;

  try {
    const res = await withRetry(
      async (signal) => {
        let response: Response;
        try {
          response = await fetch(url, {
            method,
            headers: {
              "x-api-key": env.SUBMAGIC_API_KEY as string,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal,
          });
        } catch (err) {
          // Network-level: never saw a status, so a paid call is UNKNOWN.
          throw classifyTransportError(err, kind);
        }

        const rl = readRateLimit(response);
        if (rl.remaining !== null && rl.limit !== null && rl.remaining < rl.limit * 0.1) {
          logger.warn("submagic", `provider rate limit nearly exhausted: ${rl.remaining}/${rl.limit}`);
        }

        if (!response.ok) {
          const raw = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
          let parsed: SubmagicErrorBody = {};
          try { parsed = JSON.parse(raw) as SubmagicErrorBody; } catch { /* non-JSON body */ }
          const { errorClass, code } = classifyHttpStatus(response.status, parsed.error, kind);
          throw new SubmagicError(
            `submagic ${method} ${path} -> ${response.status} ${parsed.error ?? ""}`.trim(),
            errorClass,
            code,
            response.status,
          );
        }
        return response;
      },
      {
        timeoutMs,
        // Paid calls get exactly one attempt. Retrying a create is how you end
        // up paying twice; the sweep reconciles instead.
        maxAttempts: kind === "paid" ? 1 : 3,
        isRetryable,
      },
    );

    const text = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
    await recordSuccess();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (err) {
    const e =
      err instanceof SubmagicError
        ? err
        : classifyTransportError(err, kind);
    // Only genuine transport problems count toward the breaker — a validation
    // error or a bad key says nothing about whether the service is up.
    if (e.code === "TRANSPORT") await recordFailure();
    throw e;
  }
}

// ── Endpoints ───────────────────────────────────────────────────────────────

/** VERIFIED: returns a flat array of template names, no metadata. */
export async function listTemplates(): Promise<string[]> {
  const data = await request<SubmagicTemplatesResponse>({ method: "GET", path: "/v1/templates", kind: "read" });
  return Array.isArray(data.templates) ? data.templates : [];
}

/** VERIFIED: 127 entries as { name, code }. */
export async function listLanguages(): Promise<{ name: string; code: string }[]> {
  const data = await request<SubmagicLanguagesResponse>({ method: "GET", path: "/v1/languages", kind: "read" });
  return Array.isArray(data.languages) ? data.languages : [];
}

/** PAID. Throttled and never auto-retried. */
export async function createProject(body: SubmagicCreateProjectRequest): Promise<SubmagicProject> {
  await acquireCreateSlot();
  return request<SubmagicProject>({ method: "POST", path: "/v1/projects", body, kind: "paid" });
}

/** VERIFIED to exist; id must be a UUID. Safe to retry. */
export async function getProject(projectId: string): Promise<SubmagicProject> {
  return request<SubmagicProject>({
    method: "GET",
    path: `/v1/projects/${encodeURIComponent(projectId)}`,
    kind: "read",
  });
}

/**
 * UNVERIFIED endpoint. Sends the complete word list — Submagic's documented
 * editing flow replaces the array wholesale rather than patching tokens.
 */
export async function updateProjectWords(projectId: string, words: SubmagicWord[]): Promise<void> {
  await request<unknown>({
    method: "PUT",
    path: `/v1/projects/${encodeURIComponent(projectId)}`,
    body: { words },
    kind: "read", // an update is not itself billable; a failure is safe to retry
  });
}

/** PAID. UNVERIFIED endpoint shape. */
export async function exportProject(
  projectId: string,
  options?: { width?: number; height?: number; fps?: number },
): Promise<SubmagicProject> {
  await acquireCreateSlot();
  return request<SubmagicProject>({
    method: "POST",
    path: `/v1/projects/${encodeURIComponent(projectId)}/export`,
    body: options ?? {},
    kind: "paid",
  });
}

/** For the admin ops panel. Never throws. */
export async function submagicHealth(): Promise<{ configured: boolean; reachable: boolean; breakerOpen: boolean }> {
  const configured = isSubmagicConfigured();
  const breakerOpen = await isBreakerOpen();
  if (!configured) return { configured: false, reachable: false, breakerOpen };
  try {
    await listTemplates();
    return { configured: true, reachable: true, breakerOpen };
  } catch {
    return { configured: true, reachable: false, breakerOpen };
  }
}
