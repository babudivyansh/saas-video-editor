// In-memory RouterStore with the same semantics as the Postgres one —
// including the atomic reservation (JS is single-threaded, so each
// reserveQuota call is indivisible exactly as the conditional upsert is).
// Used by the router tests; never imported by app code.

import { DEFAULT_LIMITS } from "./config";
import type { Period } from "./periods";
import type {
  AttemptCompletion, AttemptRecord, ProviderState, ProviderStatePatch, RouterStore,
} from "./store";
import { PROVIDER_NAMES, type ProviderName } from "./types";

export interface MemoryQuotaRow {
  reserved: number;
  accepted: number;
  rejected: number;
  exhausted: boolean;
}

export interface MemoryAttempt extends AttemptRecord, Partial<AttemptCompletion> {
  id: string;
}

export function createMemoryStore(init: Partial<Record<ProviderName, Partial<ProviderState>>> = {}) {
  const states = new Map<ProviderName, ProviderState>();
  PROVIDER_NAMES.forEach((p, i) => {
    states.set(p, {
      provider: p,
      enabled: true,
      priority: i + 1,
      dailyLimit: DEFAULT_LIMITS[p].daily,
      monthlyLimit: DEFAULT_LIMITS[p].monthly,
      healthStatus: "unknown",
      consecutiveFailures: 0,
      circuitBreakerUntil: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      ...init[p],
    });
  });
  const quota = new Map<string, MemoryQuotaRow>();
  const attempts: MemoryAttempt[] = [];
  const key = (p: ProviderName, period: Period) => `${p}:${period.type}:${period.start.toISOString()}`;
  const row = (k: string) => {
    let r = quota.get(k);
    if (!r) quota.set(k, (r = { reserved: 0, accepted: 0, rejected: 0, exhausted: false }));
    return r;
  };

  const store: RouterStore & {
    states: typeof states;
    quota: typeof quota;
    attempts: typeof attempts;
    quotaRow(p: ProviderName, period: Period): MemoryQuotaRow;
  } = {
    states,
    quota,
    attempts,
    quotaRow: (p, period) => row(key(p, period)),
    async getProviderStates() {
      return [...states.values()].map((s) => ({ ...s })).sort((a, b) => a.priority - b.priority);
    },
    async updateProviderState(p: ProviderName, patch: ProviderStatePatch) {
      const s = states.get(p)!;
      for (const [k, v] of Object.entries(patch)) {
        if (k in s) (s as unknown as Record<string, unknown>)[k] = v;
      }
    },
    async reserveQuota(p, period, _limit, cap) {
      if (cap !== null && cap <= 0) return false;
      const r = row(key(p, period));
      if (r.exhausted) return false;
      if (cap !== null && r.reserved >= cap) return false;
      r.reserved += 1;
      return true;
    },
    async releaseQuota(p, period) {
      const r = row(key(p, period));
      r.reserved = Math.max(0, r.reserved - 1);
    },
    async recordQuotaOutcome(p, period, outcome) {
      const r = row(key(p, period));
      if (outcome === "accepted") r.accepted += 1;
      else r.rejected += 1;
    },
    async markExhausted(p, period) {
      row(key(p, period)).exhausted = true;
    },
    async createAttempt(a) {
      const id = `att_${attempts.length + 1}`;
      attempts.push({ ...a, id, status: "sending" });
      return id;
    },
    async completeAttempt(id, c) {
      Object.assign(attempts.find((x) => x.id === id)!, c);
    },
  };
  return store;
}
