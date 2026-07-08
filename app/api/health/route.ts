import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Trivial connectivity check for an uptime monitor / load balancer — verifies
// both Postgres and Redis are actually reachable, not just that the process
// is running.
export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
  ]);

  const ok = dbOk && redisOk;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db: dbOk, redis: redisOk },
    { status: ok ? 200 : 503 },
  );
}
