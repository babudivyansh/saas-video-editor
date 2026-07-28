/**
 * Core Web Vitals bucketing.
 *
 * Pure and dependency-free so both the client reporter and the server route can
 * share one definition of the thresholds — a disagreement between them would
 * silently skew every chart built on this data.
 */

export const WEB_VITAL_METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type WebVitalMetric = (typeof WEB_VITAL_METRICS)[number];

export const WEB_VITAL_BUCKETS = ["good", "needs_improvement", "poor"] as const;
export type WebVitalBucket = (typeof WEB_VITAL_BUCKETS)[number];

/**
 * Official web.dev thresholds: [good ceiling, needs-improvement ceiling].
 * CLS is unitless; the rest are milliseconds.
 */
const THRESHOLDS: Record<WebVitalMetric, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export function isWebVitalMetric(value: string): value is WebVitalMetric {
  return (WEB_VITAL_METRICS as readonly string[]).includes(value);
}

export function bucketFor(metric: WebVitalMetric, value: number): WebVitalBucket {
  const [good, needsImprovement] = THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value <= needsImprovement) return "needs_improvement";
  return "poor";
}

/**
 * Collapses a URL to a low-cardinality route key.
 *
 * Every dynamic segment becomes its own row otherwise, so a blog with hundreds
 * of posts would bury the aggregate. Query strings and fragments are dropped
 * outright — they can carry PII and this table is meant to be anonymous.
 */
export function normalizeVitalsPath(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const collapsed = clean
    .replace(/^\/blog\/category\/[^/]+$/, "/blog/category/[slug]")
    .replace(/^\/blog\/author\/[^/]+$/, "/blog/author/[slug]")
    .replace(/^\/blog\/[^/]+$/, "/blog/[slug]")
    .replace(/^\/help\/[^/]+$/, "/help/[slug]")
    .replace(/^\/reviews\/[^/]+$/, "/reviews/[id]");
  return collapsed.slice(0, 128);
}
