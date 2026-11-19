// The routing decision: which provider sends this email, and what happens
// when one fails.
//
//   for each enabled provider, in priority order:
//     skip it if: no credentials · suspended · circuit open · quota slot unavailable
//     try it once
//       accepted          → done
//       recipient error   → STOP (every provider would refuse that address)
//       unknown outcome   → STOP (it may have been sent; a second provider
//                           would deliver a duplicate). Resend alone is retried
//                           once on itself — its Idempotency-Key makes that safe.
//       anything else     → note it on the provider, try the next one
//   none left → failed, and "all providers unavailable" is raised
//
// Pure apart from the injected store/alerts/providers, so every branch is
// unit-tested with fakes (router.test.ts).

import { BREAKER, criticalReserve, fallbackEnabled as fallbackEnabledDefault } from "./config";
import { alertKey, type AlertSink } from "./alerts";
import { dayPeriod, monthPeriod, type Period } from "./periods";
import type { ProviderState, RouterStore } from "./store";
import type { EmailPriority, EmailProvider, OutboundEmail, ProviderName, SendOutcome } from "./types";

export type SkipReason =
  | "disabled" | "not_configured" | "suspended" | "circuit_open" | "quota_unavailable" | "fallback_disabled";

export interface RouteResult {
  status: "accepted" | "failed" | "unknown";
  provider: ProviderName | null;
  providerMessageId: string | null;
  /** Real provider calls made (skips not counted). */
  attempts: number;
  fallbackUsed: boolean;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  skipped: { provider: ProviderName; reason: SkipReason }[];
  /** True when the failure was the address itself — retrying cannot help. */
  permanent: boolean;
}

export interface RouterDeps {
  store: RouterStore;
  alerts: AlertSink;
  providers: Record<ProviderName, EmailProvider>;
  now?: () => Date;
  fallbackEnabled?: boolean;
}

/** Can this provider be tried right now? (Quota is checked separately: it reserves.) */
export function availability(
  state: ProviderState,
  provider: EmailProvider,
  now: Date,
): SkipReason | null {
  if (!state.enabled) return "disabled";
  if (!provider.isConfigured()) return "not_configured";
  if (state.healthStatus === "suspended") return "suspended";
  if (state.circuitBreakerUntil && state.circuitBreakerUntil > now) return "circuit_open";
  return null;
}

/** Take a day slot and (if limited) a month slot; all or nothing. */
async function reserve(
  store: RouterStore,
  state: ProviderState,
  priority: EmailPriority,
  day: Period,
  month: Period,
): Promise<boolean> {
  const keep = priority === "critical" ? 0 : criticalReserve(state.dailyLimit);
  const dayCap = state.dailyLimit == null ? null : state.dailyLimit - keep;
  if (!(await store.reserveQuota(state.provider, day, state.dailyLimit, dayCap))) return false;
  const monthKeep = priority === "critical" ? 0 : criticalReserve(state.monthlyLimit);
  const monthCap = state.monthlyLimit == null ? null : state.monthlyLimit - monthKeep;
  if (!(await store.reserveQuota(state.provider, month, state.monthlyLimit, monthCap))) {
    await store.releaseQuota(state.provider, day);
    return false;
  }
  return true;
}

async function release(store: RouterStore, p: ProviderName, day: Period, month: Period) {
  await store.releaseQuota(p, day);
  await store.releaseQuota(p, month);
}

/** Record what a failure means for the provider's health. */
async function applyFailure(
  deps: RouterDeps,
  state: ProviderState,
  outcome: Extract<SendOutcome, { ok: false }>,
  now: Date,
  day: Period,
  month: Period,
): Promise<void> {
  const { store, alerts } = deps;
  const p = state.provider;
  const base = { lastFailureAt: now, lastErrorCode: outcome.code, lastErrorMessage: outcome.message };

  switch (outcome.errorClass) {
    case "quota": {
      const period = outcome.quotaPeriod === "month" ? month : day;
      await store.markExhausted(p, period);
      await store.updateProviderState(p, { ...base, healthStatus: "quota_exhausted" });
      await alerts.raise({
        kind: "quota_exhausted", severity: "warning", provider: p,
        message: `${p} quota exhausted — temporarily unavailable until the ${period.type === "day" ? "daily" : "monthly"} reset`,
        dedupeKey: alertKey("quota_exhausted", p, period.start.toISOString().slice(0, 10)),
      });
      return;
    }
    case "rate_limit": {
      const waitMs = (outcome.retryAfterSec ?? BREAKER.rateLimitMs / 1000) * 1000;
      await store.updateProviderState(p, {
        ...base, healthStatus: "rate_limited", circuitBreakerUntil: new Date(now.getTime() + waitMs),
      });
      return;
    }
    case "auth":
    case "sender_config": {
      await store.updateProviderState(p, {
        ...base, healthStatus: "misconfigured",
        circuitBreakerUntil: new Date(now.getTime() + BREAKER.misconfiguredMs),
      });
      await alerts.raise({
        kind: "provider_misconfigured", severity: "critical", provider: p,
        message: `${p} refused our ${outcome.errorClass === "auth" ? "API key" : "sender address/domain"} (${outcome.code})`,
      });
      return;
    }
    case "suspended": {
      // Not retried, not auto-recovered: a compliance suspension is lifted by
      // the provider and then cleared by an admin — never worked around here.
      await store.updateProviderState(p, { ...base, healthStatus: "suspended" });
      await alerts.raise({
        kind: "provider_suspended", severity: "critical", provider: p,
        message: `${p} reports the account or key as suspended (${outcome.code}); resolve it with ${p}, then clear it on Admin → Email`,
      });
      return;
    }
    case "transient":
    case "invalid_request":
    case "unknown_outcome": {
      const failures = state.consecutiveFailures + 1;
      const open = failures >= BREAKER.failureThreshold;
      state.consecutiveFailures = failures;
      await store.updateProviderState(p, {
        ...base,
        consecutiveFailures: failures,
        healthStatus: open ? "unavailable" : "degraded",
        ...(open ? { circuitBreakerUntil: new Date(now.getTime() + BREAKER.openMs) } : {}),
      });
      if (open) {
        await alerts.raise({
          kind: "provider_unavailable", severity: "warning", provider: p,
          message: `${p} failed ${failures} times in a row (${outcome.code}); skipped for ${BREAKER.openMs / 60_000} min`,
        });
      }
      return;
    }
    case "recipient":
      // The address, not the provider. Health untouched.
      return;
  }
}

export async function routeEmail(
  email: OutboundEmail,
  priority: EmailPriority,
  deps: RouterDeps,
): Promise<RouteResult> {
  const { store, alerts, providers } = deps;
  const now = deps.now?.() ?? new Date();
  const fallback = deps.fallbackEnabled ?? fallbackEnabledDefault();
  const day = dayPeriod(now);
  const month = monthPeriod(now);
  const started = Date.now();

  const states = await store.getProviderStates();
  const skipped: RouteResult["skipped"] = [];
  let attempts = 0;
  let attemptNumber = 0;
  let firstEligibleSeen = false;
  let last: Extract<SendOutcome, { ok: false }> | null = null;

  const result = (r: Partial<RouteResult> & Pick<RouteResult, "status">): RouteResult => ({
    provider: null, providerMessageId: null, attempts, fallbackUsed: false,
    latencyMs: Date.now() - started, errorCode: last?.code ?? null, errorMessage: last?.message ?? null,
    skipped, permanent: false, ...r,
  });

  for (const state of states) {
    const provider = providers[state.provider];
    if (!provider) continue;

    if (firstEligibleSeen && !fallback) {
      skipped.push({ provider: state.provider, reason: "fallback_disabled" });
      continue;
    }
    const why = availability(state, provider, now);
    if (why) {
      skipped.push({ provider: state.provider, reason: why });
      continue;
    }
    if (!(await reserve(store, state, priority, day, month))) {
      skipped.push({ provider: state.provider, reason: "quota_unavailable" });
      if (state.healthStatus !== "quota_exhausted") {
        await store.updateProviderState(state.provider, { healthStatus: "quota_exhausted" });
      }
      continue;
    }
    firstEligibleSeen = true;

    // One call, plus — for Resend only — one same-provider retry of an
    // unknown outcome, which its Idempotency-Key turns into a no-op if the
    // first one had in fact gone through.
    let outcome: SendOutcome;
    let tries = 0;
    do {
      tries += 1;
      attempts += 1;
      attemptNumber += 1;
      const attemptId = await store.createAttempt({
        emailMessageId: email.messageId, provider: state.provider, attemptNumber,
      });
      outcome = await provider.send(email);
      await store.completeAttempt(attemptId, outcome.ok
        ? { status: "accepted", providerMessageId: outcome.providerMessageId, latencyMs: outcome.latencyMs }
        : {
            status: outcome.errorClass === "unknown_outcome" ? "unknown" : outcome.errorClass === "transient" ? "failed" : "rejected",
            errorClass: outcome.errorClass, errorCode: outcome.code,
            sanitizedErrorMessage: outcome.message, latencyMs: outcome.latencyMs,
          });
    } while (!outcome.ok && outcome.errorClass === "unknown_outcome" && state.provider === "resend" && tries < 2);

    if (outcome.ok) {
      await store.recordQuotaOutcome(state.provider, day, "accepted");
      await store.recordQuotaOutcome(state.provider, month, "accepted");
      await store.updateProviderState(state.provider, {
        healthStatus: "healthy", consecutiveFailures: 0, circuitBreakerUntil: null, lastSuccessAt: now,
      });
      await alerts.resolve(alertKey("provider_unavailable", state.provider));
      await alerts.resolve(alertKey("all_providers_unavailable"));
      const fallbackUsed = attempts > 1 || skipped.some((s) => s.reason !== "disabled" && s.reason !== "not_configured");
      if (fallbackUsed) {
        await alerts.raise({
          kind: "fallback_active", severity: "info", provider: state.provider,
          message: `Sending through backup provider ${state.provider}`,
        });
      }
      return result({
        status: "accepted", provider: state.provider, providerMessageId: outcome.providerMessageId,
        fallbackUsed, errorCode: null, errorMessage: null,
      });
    }

    last = outcome;
    await store.recordQuotaOutcome(state.provider, day, "rejected");

    if (outcome.errorClass === "unknown_outcome") {
      // Keep the reservation: the provider may well have counted it.
      await applyFailure(deps, state, outcome, now, day, month);
      return result({ status: "unknown", provider: state.provider });
    }

    await release(store, state.provider, day, month);
    await applyFailure(deps, state, outcome, now, day, month);

    if (outcome.errorClass === "recipient") {
      return result({ status: "failed", provider: state.provider, permanent: true });
    }
  }

  await alerts.raise({
    kind: "all_providers_unavailable",
    severity: "critical",
    message: `No email provider could send "${email.templateId}" (${skipped.map((s) => `${s.provider}: ${s.reason}`).join(", ") || last?.code || "none configured"})`,
  });
  return result({ status: "failed", errorCode: last?.code ?? "no_provider_available" });
}
