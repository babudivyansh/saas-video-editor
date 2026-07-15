import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { metricsQuerySchema } from "@/lib/admin/schemas";
import { computeSection } from "@/lib/admin/metrics";

// GET /api/admin/metrics?section=kpis|revenue|ai|social|infra&range=7|30|90
// One endpoint, section-parameterized: the dashboard fetches exactly the tab
// being viewed. Cached per (section, range); infra gets a short TTL because a
// 5-minute-stale health view defeats its purpose.
const TTL: Record<string, number> = { infra: 30 };
const DEFAULT_TTL = 300;

export const GET = withAdmin(async (req) => {
  const { section, range } = parseQuery(req, metricsQuerySchema);

  const cacheKey = `admin:metrics:${section}:${range}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return NextResponse.json({ ...JSON.parse(cached), cached: true });
    } catch {
      /* recompute */
    }
  }

  const data = await computeSection(section, range);
  const payload = { section, range, generatedAt: new Date().toISOString(), data };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", TTL[section] ?? DEFAULT_TTL);
  return NextResponse.json({ ...payload, cached: false });
});
