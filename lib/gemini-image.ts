import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/user-facing-error";

// One place that calls gemini-2.5-flash-image for both the Image Generator and
// Photo Edit, so a refusal is read the same way in both.
//
// Sentry CLIPIRO-WEB-W/-X (2026-11-16): every request got 429 "You exceeded
// your current quota". Both routes retried only 503, then logged the 429 as a
// generic failure and told the user to "try again in a moment" — which can
// never work when the quota is a daily cap or a free-tier limit of zero. The
// 429 body says which quota was hit, so: a short per-minute limit is waited
// out and retried; a daily or free-tier cap is reported once as what it is
// (an account/billing problem for the owner) and the user is told to pick
// another model.

export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

const MAX_ATTEMPTS = 3;
/** Longest retryDelay we will sit through inside one request. */
const MAX_WAIT_MS = 15_000;

export const GEMINI_IMAGE_UNAVAILABLE =
  "Gemini image is unavailable right now. Your credits were refunded — please pick another model.";
export const GEMINI_IMAGE_BUSY =
  "The image service is busy right now. Your credits were refunded. Try again in a moment, or pick another model.";

/**
 * After a hard-cap 429 the key stays unusable for a while (a free-tier key has
 * no image quota at all). Calls in this window fail fast, without hitting
 * Google and without paging again: CLIPIRO-WEB-12 was five Sentry events from
 * one person's two Photo Edit attempts, one per parallel image.
 */
export const HARD_CAP_COOLDOWN_MS = 15 * 60 * 1000;
const breaker = ((globalThis as unknown as { __geminiImageBreaker?: { until: number } }).__geminiImageBreaker ??= { until: 0 });

/** Test hook. */
export function resetGeminiImageCooldown(): void {
  breaker.until = 0;
}

export interface QuotaInfo {
  /** Quota ids Google named, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier". */
  quotaIds: string[];
  /** Google's suggested wait, in ms, if it gave one. */
  retryDelayMs: number | null;
  /** True when waiting a few seconds cannot help (daily cap or free tier). */
  hardCap: boolean;
}

/** Reads a Gemini 429 body. Unknown shapes are treated as a soft (per-minute) limit. */
export function parseQuotaError(bodyText: string): QuotaInfo {
  let details: unknown[] = [];
  try {
    const parsed = JSON.parse(bodyText) as { error?: { details?: unknown[] } };
    details = Array.isArray(parsed?.error?.details) ? parsed.error.details : [];
  } catch {
    // not JSON — fall through with no details
  }
  const quotaIds: string[] = [];
  let retryDelayMs: number | null = null;
  for (const d of details) {
    const rec = d as { violations?: { quotaId?: unknown }[]; retryDelay?: unknown };
    for (const v of rec.violations ?? []) {
      if (typeof v?.quotaId === "string") quotaIds.push(v.quotaId);
    }
    if (typeof rec.retryDelay === "string") {
      const secs = Number.parseFloat(rec.retryDelay);
      if (Number.isFinite(secs)) retryDelayMs = Math.round(secs * 1000);
    }
  }
  const hardCap = quotaIds.some((id) => /PerDay|FreeTier/i.test(id));
  return { quotaIds, retryDelayMs, hardCap };
}

/**
 * POSTs one generateContent request to Gemini Flash Image. Returns the OK
 * response; throws a UserFacingError (already logged) when Gemini refuses.
 */
export async function postGeminiImage(
  body: unknown,
  opts: { tag: string; signal?: AbortSignal; onRetry?: (attempt: number) => void },
): Promise<Response> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  if (Date.now() < breaker.until) throw new UserFacingError(GEMINI_IMAGE_UNAVAILABLE);
  const payload = JSON.stringify(body);

  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(120_000);
    const res = await fetch(URL, {
      method: "POST",
      // Key in a header, not the URL: URLs end up in proxy and APM logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      body: payload,
    });
    if (res.ok) return res;

    const text = await res.text().catch(() => "");
    const last = attempt >= MAX_ATTEMPTS;

    if (res.status === 503) {
      if (!last) {
        logger.warn(opts.tag, `${GEMINI_IMAGE_MODEL} 503 (attempt ${attempt}/${MAX_ATTEMPTS})`);
        opts.onRetry?.(attempt);
        await sleep(2000 * attempt, opts.signal);
        continue;
      }
      // Google's capacity, not ours: the user is told and refunded.
      logger.warn(opts.tag, `${GEMINI_IMAGE_MODEL} still 503 after ${MAX_ATTEMPTS} attempts`);
      throw new UserFacingError(GEMINI_IMAGE_BUSY);
    }

    if (res.status === 429) {
      const quota = parseQuotaError(text);
      if (quota.hardCap) {
        // Needs the owner (billing / quota in Google AI Studio), not a retry.
        // Reported once per cooldown: parallel images all get this 429.
        const alreadyReported = Date.now() < breaker.until;
        breaker.until = Date.now() + Math.max(HARD_CAP_COOLDOWN_MS, quota.retryDelayMs ?? 0);
        if (alreadyReported) throw new UserFacingError(GEMINI_IMAGE_UNAVAILABLE);
        logger.error(opts.tag, `${GEMINI_IMAGE_MODEL} quota exhausted (${quota.quotaIds.join(", ") || "unknown quota"}) — the Gemini API key needs billing or a higher quota`, text.slice(0, 500));
        throw new UserFacingError(GEMINI_IMAGE_UNAVAILABLE);
      }
      const wait = Math.min(quota.retryDelayMs ?? 2000 * attempt, MAX_WAIT_MS);
      if (!last) {
        logger.warn(opts.tag, `${GEMINI_IMAGE_MODEL} 429 rate limit (attempt ${attempt}/${MAX_ATTEMPTS}), waiting ${wait}ms`);
        opts.onRetry?.(attempt);
        await sleep(wait, opts.signal);
        continue;
      }
      logger.warn(opts.tag, `${GEMINI_IMAGE_MODEL} still rate limited after ${MAX_ATTEMPTS} attempts`, text.slice(0, 500));
      throw new UserFacingError(GEMINI_IMAGE_BUSY);
    }

    logger.error(opts.tag, `${GEMINI_IMAGE_MODEL} failed ${res.status}`, text.slice(0, 500));
    throw new Error(`${GEMINI_IMAGE_MODEL} failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });
}
