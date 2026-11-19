import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { redis } from "@/lib/redis";
import { FUNNEL_RANGES, getFunnelReport, type FunnelRange } from "@/lib/admin/funnel";

// GET /api/admin/funnel?days=7|30|90 — Admin → Analytics activation funnel,
// retention by signup week, and failure breakdown (lib/admin/funnel.ts).
// Cached 5 minutes: it scans every recent signup's activity.
const TTL_SECONDS = 300;

export const GET = withAdmin(async (req) => {
  const raw = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const days = (FUNNEL_RANGES as readonly number[]).includes(raw) ? (raw as FunnelRange) : 30;
  const key = `admin:funnel:${days}`;
  const cached = await redis.get(key);
  if (cached) return NextResponse.json(JSON.parse(cached));

  const report = await getFunnelReport(days);
  await redis.set(key, JSON.stringify(report), "EX", TTL_SECONDS);
  return NextResponse.json(report);
});
