// Façade over the pure metrics engine in lib/social/metrics/.
//
// The implementation moved out of this file so each formula lives in a small,
// separately-testable module. This re-export keeps every existing consumer —
// app/api/social/analytics/route.ts, app/report/social/[token]/page.tsx,
// lib/social/insights.ts, and analytics.test.ts — compiling unchanged.
//
// New code should import from "@/lib/social/metrics" directly.

export {
  // account aggregate
  computeAnalytics,
  type AccountAnalytics,
  // per-post
  postEngagementRate,
  postInteractions,
  postShareRate,
  contentTypeBreakdown,
  // timing
  computeBestTimes,
  postingFrequency,
  postingConsistency,
  type BestTimeCell,
  type BestTimes,
  // alerts
  computeAlerts,
  type AccountAlert,
  type AlertCode,
  // benchmarks
  ER_BENCHMARKS,
  benchmark,
  // shared shapes
  type SnapshotRow,
  type PostRow,
  type SeriesPoint,
  type MetricDelta,
} from "./metrics";
