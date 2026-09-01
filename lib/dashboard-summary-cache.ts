import { redis } from "./redis";
import { logger } from "./logger";

// GET /api/dashboard/summary caches its payload per user for 60s. Nothing used
// to clear it, so any project write — create, rename, delete — kept serving the
// stale copy for up to a minute. Most visibly: deleting a project and reloading
// brought the card straight back, which reads as "delete is broken".

export const dashboardSummaryKey = (userId: string) => `dash-summary:${userId}`;

export const DASHBOARD_SUMMARY_TTL_SECONDS = 60;

/** Best-effort: a cache that won't drop must never fail the write it follows. */
export async function invalidateDashboardSummary(userId: string): Promise<void> {
  try {
    await redis.del(dashboardSummaryKey(userId));
  } catch (err) {
    logger.error("dashboard-summary", "cache invalidation failed", { userId, err });
  }
}
