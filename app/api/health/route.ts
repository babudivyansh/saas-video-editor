import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getRenderRuntimeHealth } from "@/lib/render-runtime";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { getSyncStats } from "@/lib/social/service";

// Connectivity check for an uptime monitor / load balancer — verifies Postgres
// and Redis are actually reachable, not just that the process is running.
// Only those two decide 200 vs 503: they take the whole app down, and a load
// balancer acting on this must not pull an instance over anything less.
//
// `render` reports whether ffmpeg can actually export (the P0-2 outage was a
// deployed binary missing drawtext — every export failed while this endpoint
// said "ok"). It degrades `status` without flipping the code, so an uptime
// monitor can alert on it. A healthy probe is cached in-process, so this is
// cheap after the first call.
//
// Social sync ok/fail tallies stay (cheap Redis counters an uptime monitor
// alerts on). The active/stale ACCOUNT counts that used to sit beside them
// were two unauthenticated COUNT queries per probe, publishing a business
// number; they're dropped here.
export async function GET() {
  const [dbOk, redisOk, renderOk, syncStats] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
    getRenderRuntimeHealth(ffmpegBin).then((r) => r.ok).catch(() => false),
    getSyncStats().catch(() => ({ ok: 0, fail: 0 })),
  ]);

  const ok = dbOk && redisOk;
  return NextResponse.json(
    {
      status: !ok ? "down" : renderOk ? "ok" : "degraded",
      db: dbOk,
      redis: redisOk,
      render: renderOk,
      social: { syncsToday: syncStats },
    },
    { status: ok ? 200 : 503 },
  );
}
