// Persistence for the router, behind an interface so the routing logic can be
// tested against an in-memory store (memory-store.ts) with the same
// semantics, and run in production against Postgres.

import { prisma } from "@/lib/prisma";
import { DEFAULT_LIMITS, defaultPriority } from "./config";
import type { Period, PeriodType } from "./periods";
import { PROVIDER_NAMES, type ErrorClass, type ProviderName } from "./types";

export type HealthStatus =
  | "healthy" | "degraded" | "unavailable" | "rate_limited" | "quota_exhausted"
  | "misconfigured" | "suspended" | "unknown";

export interface ProviderState {
  provider: ProviderName;
  enabled: boolean;
  priority: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  healthStatus: HealthStatus;
  consecutiveFailures: number;
  circuitBreakerUntil: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export type ProviderStatePatch = Partial<Omit<ProviderState, "provider">> & {
  lastCheckedAt?: Date;
  reportedRemaining?: number | null;
  reportedAt?: Date;
  senderVerified?: boolean | null;
};

export type AttemptStatus = "sending" | "accepted" | "rejected" | "failed" | "unknown";

export interface AttemptRecord {
  emailMessageId: string;
  provider: ProviderName;
  attemptNumber: number;
}

export interface AttemptCompletion {
  status: AttemptStatus;
  providerMessageId?: string | null;
  errorClass?: ErrorClass | null;
  errorCode?: string | null;
  sanitizedErrorMessage?: string | null;
  latencyMs?: number | null;
}

export interface RouterStore {
  getProviderStates(): Promise<ProviderState[]>;
  updateProviderState(provider: ProviderName, patch: ProviderStatePatch): Promise<void>;
  /** Atomically take one slot. false = at the cap, or the provider said exhausted. */
  reserveQuota(provider: ProviderName, period: Period, limit: number | null, cap: number | null): Promise<boolean>;
  releaseQuota(provider: ProviderName, period: Period): Promise<void>;
  recordQuotaOutcome(provider: ProviderName, period: Period, outcome: "accepted" | "rejected"): Promise<void>;
  markExhausted(provider: ProviderName, period: Period): Promise<void>;
  createAttempt(a: AttemptRecord): Promise<string>;
  completeAttempt(id: string, c: AttemptCompletion): Promise<void>;
}

function toState(r: {
  provider: string; enabled: boolean; priority: number; dailyLimit: number | null; monthlyLimit: number | null;
  healthStatus: string; consecutiveFailures: number; circuitBreakerUntil: Date | null; lastSuccessAt: Date | null;
  lastFailureAt: Date | null; lastErrorCode: string | null; lastErrorMessage: string | null;
}): ProviderState {
  return { ...r, provider: r.provider as ProviderName, healthStatus: r.healthStatus as HealthStatus };
}

/** Rows for providers that have none yet, from env defaults. Idempotent. */
export async function ensureProviderRows(): Promise<void> {
  const order = defaultPriority();
  await prisma.emailProviderStatus.createMany({
    data: PROVIDER_NAMES.map((p) => ({
      provider: p,
      priority: order.indexOf(p) + 1,
      dailyLimit: DEFAULT_LIMITS[p].daily,
      monthlyLimit: DEFAULT_LIMITS[p].monthly,
    })),
    skipDuplicates: true,
  });
}

export const prismaRouterStore: RouterStore = {
  async getProviderStates() {
    let rows = await prisma.emailProviderStatus.findMany({ orderBy: { priority: "asc" } });
    if (rows.length < PROVIDER_NAMES.length) {
      await ensureProviderRows();
      rows = await prisma.emailProviderStatus.findMany({ orderBy: { priority: "asc" } });
    }
    return rows.filter((r) => (PROVIDER_NAMES as readonly string[]).includes(r.provider)).map(toState);
  },

  async updateProviderState(provider, patch) {
    await prisma.emailProviderStatus.update({ where: { provider }, data: patch });
  },

  async reserveQuota(provider, period, limit, cap) {
    if (cap !== null && cap <= 0) return false;
    // One statement, so concurrent requests serialize on the row lock: the
    // WHERE re-checks the count each time, and only rows that actually
    // incremented come back. An INSERT (first send of the period) starts at 1.
    const rows = await prisma.$queryRaw<{ reservedCount: number }[]>`
      INSERT INTO "EmailQuotaUsage"
        ("id", "provider", "periodType", "periodStart", "periodEnd", "configuredLimit", "reservedCount", "updatedAt")
      VALUES (gen_random_uuid()::text, ${provider}, ${period.type}, ${period.start}, ${period.end}, ${limit}::int, 1, now())
      ON CONFLICT ("provider", "periodType", "periodStart") DO UPDATE
        SET "reservedCount" = "EmailQuotaUsage"."reservedCount" + 1,
            "configuredLimit" = EXCLUDED."configuredLimit",
            "updatedAt" = now()
        WHERE "EmailQuotaUsage"."exhaustedAt" IS NULL
          AND (${cap}::int IS NULL OR "EmailQuotaUsage"."reservedCount" < ${cap}::int)
      RETURNING "reservedCount"`;
    return rows.length > 0;
  },

  async releaseQuota(provider, period) {
    await prisma.$executeRaw`
      UPDATE "EmailQuotaUsage" SET "reservedCount" = GREATEST("reservedCount" - 1, 0), "updatedAt" = now()
      WHERE "provider" = ${provider} AND "periodType" = ${period.type} AND "periodStart" = ${period.start}`;
  },

  async recordQuotaOutcome(provider, period, outcome) {
    await prisma.emailQuotaUsage.updateMany({
      where: { provider, periodType: period.type, periodStart: period.start },
      data: outcome === "accepted" ? { acceptedCount: { increment: 1 } } : { rejectedCount: { increment: 1 } },
    });
  },

  async markExhausted(provider, period) {
    await prisma.emailQuotaUsage.upsert({
      where: { provider_periodType_periodStart: { provider, periodType: period.type, periodStart: period.start } },
      create: { provider, periodType: period.type, periodStart: period.start, periodEnd: period.end, exhaustedAt: new Date() },
      update: { exhaustedAt: new Date() },
    });
  },

  async createAttempt(a) {
    const row = await prisma.emailAttempt.create({ data: { ...a, status: "sending" }, select: { id: true } });
    return row.id;
  },

  async completeAttempt(id, c) {
    await prisma.emailAttempt.update({ where: { id }, data: { ...c, completedAt: new Date() } });
  },
};

export type { PeriodType };
