// What one account consumed, per feature, on BOTH meters:
//   - credits (CreditTransaction, "spend:<toolSlug>") — the AI tools
//   - Clip Minutes (MinuteTransaction, "spend:auto-clip") — AutoClip since 2026-09-26
//
// Read from the ledgers, not Generation.creditsCost: AutoClip logs its
// Generation row with creditsCost 0 (it pays in minutes), and rerenders /
// minute-overflow charges never write a Generation at all. Refunds share the
// spend's refId, so each spend is netted against its own refunds — a failed
// run that was refunded counts as nothing used.
//
// A spend can write several rows (one per bucket it drained) under one refId,
// so spends are collapsed per refId BEFORE refunds are joined; joining first
// would count a refund once per bucket row.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { usageDisplayName } from "@/lib/billing/usage";

export type UsageMeter = "credits" | "minutes";

export interface FeatureUsage {
  /** Ledger slug after "spend:", e.g. "auto-clip", "voiceover". */
  feature: string;
  label: string;
  /** Gross amount charged. */
  spent: number;
  /** Given back by refunds of those same charges. */
  refunded: number;
  /** spent − refunded: what the user actually consumed. */
  net: number;
  /** Number of charges (runs / generations). */
  uses: number;
  lastUsedAt: string | null;
}

export interface UserUsage {
  rangeDays: number | null;
  credits: { features: FeatureUsage[]; net: number };
  minutes: { features: FeatureUsage[]; net: number };
}

type Row = { feature: string | null; spent: bigint | number; refunded: bigint | number; uses: bigint | number; last: Date | null };

async function byFeature(table: "CreditTransaction" | "MinuteTransaction", userId: string, since: Date | null): Promise<FeatureUsage[]> {
  const tbl = Prisma.raw(`"${table}"`);
  const sinceClause = since ? Prisma.sql`AND "createdAt" >= ${since}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Row[]>`
    WITH spends AS (
      SELECT COALESCE("refId", id) AS ref,
             MIN(substring(reason from 7)) AS feature,
             SUM(-delta) AS spent,
             MAX("createdAt") AS last
      FROM ${tbl}
      WHERE "userId" = ${userId} AND reason LIKE 'spend:%' AND delta < 0 ${sinceClause}
      GROUP BY 1
    ),
    refunds AS (
      SELECT "refId" AS ref, SUM(delta) AS refunded
      FROM ${tbl}
      WHERE "userId" = ${userId} AND reason LIKE 'refund%' AND "refId" IS NOT NULL AND delta > 0
      GROUP BY 1
    )
    SELECT s.feature,
           SUM(s.spent) AS spent,
           -- COALESCE inside LEAST: Postgres' LEAST ignores NULLs, so a spend
           -- with no refund row would otherwise count as fully refunded.
           COALESCE(SUM(LEAST(COALESCE(r.refunded, 0), s.spent)), 0) AS refunded,
           COUNT(*) AS uses,
           MAX(s.last) AS last
    FROM spends s LEFT JOIN refunds r ON r.ref = s.ref
    GROUP BY 1`;

  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const spent = Number(r.spent);
      const refunded = Number(r.refunded);
      const feature = r.feature || "unknown";
      return {
        feature,
        label: usageDisplayName(null, feature),
        spent,
        refunded,
        net: Math.max(0, spent - refunded),
        uses: Number(r.uses),
        lastUsedAt: r.last ? new Date(r.last).toISOString() : null,
      };
    })
    .sort((a, b) => b.net - a.net || b.uses - a.uses);
}

/** `rangeDays` null = all time. */
export async function getUserUsage(userId: string, rangeDays: number | null): Promise<UserUsage> {
  const since = rangeDays ? new Date(Date.now() - rangeDays * 86_400_000) : null;
  const [credits, minutes] = await Promise.all([
    byFeature("CreditTransaction", userId, since),
    byFeature("MinuteTransaction", userId, since),
  ]);
  const total = (f: FeatureUsage[]) => f.reduce((n, x) => n + x.net, 0);
  return {
    rangeDays,
    credits: { features: credits, net: total(credits) },
    minutes: { features: minutes, net: total(minutes) },
  };
}
