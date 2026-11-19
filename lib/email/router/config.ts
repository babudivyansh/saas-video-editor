// Router configuration: env defaults, overridable per provider from
// Admin → Email (stored on EmailProviderStatus) and globally via Config KV.

import { env } from "@/lib/env";
import { PROVIDER_NAMES, isProviderName, type EmailPriority, type ProviderName } from "./types";

export function routerEnabled(): boolean {
  return env.EMAIL_ROUTER_ENABLED === "true";
}

export function fallbackEnabled(): boolean {
  return env.EMAIL_FALLBACK_ENABLED !== "false";
}

function pct(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : d;
}

export function quotaThresholds(): { warning: number; critical: number } {
  return { warning: pct(env.EMAIL_QUOTA_WARNING_PERCENT, 70), critical: pct(env.EMAIL_QUOTA_CRITICAL_PERCENT, 90) };
}

/** Default priority order: env, else brevo → mailjet → resend. Unknown names dropped, missing ones appended. */
export function defaultPriority(): ProviderName[] {
  const fromEnv = (env.EMAIL_PROVIDER_PRIORITY ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isProviderName);
  const seen = [...new Set(fromEnv)];
  for (const p of PROVIDER_NAMES) if (!seen.includes(p)) seen.push(p);
  return seen;
}

/**
 * Starting limits for a fresh database — the free-plan allowances as each
 * provider published them on 2026-11-19. They are CONFIGURATION, not facts:
 * plans change and a paid account has different numbers. Edit them on
 * Admin → Email; the database value wins once a row exists.
 *
 *   Brevo   300/day                 help.brevo.com/hc/en-us/articles/208580669
 *   Mailjet 200/day, 6,000/month    mailjet.com/pricing
 *   Resend  100/day, 3,000/month    resend.com/docs/knowledge-base/account-quotas-and-limits
 */
export const DEFAULT_LIMITS: Record<ProviderName, { daily: number | null; monthly: number | null }> = {
  brevo: { daily: 300, monthly: null },
  mailjet: { daily: 200, monthly: 6000 },
  resend: { daily: 100, monthly: 3000 },
};

/** Circuit breaker tuning. */
export const BREAKER = {
  /** Consecutive transient failures before the provider is skipped. */
  failureThreshold: 3,
  /** How long it is skipped before one trial send is allowed through. */
  openMs: 5 * 60_000,
  /** Auth / sender misconfiguration: skipped this long, or until a health check passes. */
  misconfiguredMs: 60 * 60_000,
  /** Rate limit without a Retry-After header. */
  rateLimitMs: 60_000,
};

/** Templates that are never delayed, and get first claim on quota. */
const CRITICAL = new Set(["otp", "password-reset", "verify-email", "change-email-confirm"]);
/** Security alerts and money. */
const HIGH_GROUPS = new Set(["billing"]);
const HIGH = new Set([
  "login-alert", "password-changed", "email-changed", "two-factor-changed", "two-factor-lockout",
  "account-export-ready",
]);

export function priorityFor(templateId: string, group?: string): EmailPriority {
  if (CRITICAL.has(templateId)) return "critical";
  if (HIGH.has(templateId) || (group && HIGH_GROUPS.has(group))) return "high";
  return "normal";
}

/**
 * Slots kept back for critical mail on each provider's DAILY allowance: a
 * burst of welcome emails must not spend the last slots a sign-up code
 * needs. Normal mail may use up to (limit − reserve); critical may use all.
 */
export function criticalReserve(limit: number | null): number {
  if (limit == null) return 0;
  return Math.min(Math.floor(limit * 0.1), 50);
}

/** Config KV key for the global "pause non-critical email" switch. */
export const PAUSE_NONCRITICAL_KEY = "email_pause_noncritical";
