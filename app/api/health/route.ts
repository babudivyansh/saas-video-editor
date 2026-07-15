import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getSyncStats } from "@/lib/social/service";

// Connectivity check for an uptime monitor / load balancer — verifies Postgres
// and Redis are actually reachable, not just that the process is running.
// Also reports Social Tracker sync freshness so a silently-failing sync
// pipeline shows up on the same monitor. Sync staleness is informational: it
// does not flip the endpoint to 503 (the app itself is still healthy).
export async function GET() {
  const staleCutoff = new Date(Date.now() - 24 * 3600_000);
  const [dbOk, redisOk, syncStats, activeAccounts, staleAccounts] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
    getSyncStats().catch(() => ({ ok: 0, fail: 0 })),
    prisma.socialAccount.count({ where: { status: "active" } }).catch(() => -1),
    prisma.socialAccount
      .count({ where: { status: "active", OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleCutoff } }] } })
      .catch(() => -1),
  ]);

  const ok = dbOk && redisOk;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      db: dbOk,
      redis: redisOk,
      social: { syncsToday: syncStats, activeAccounts, staleOver24h: staleAccounts },
    },
    { status: ok ? 200 : 503 },
  );
}
