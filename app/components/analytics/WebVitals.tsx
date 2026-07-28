"use client";

import { useReportWebVitals } from "next/web-vitals";
import { isWebVitalMetric } from "@/lib/web-vitals";

/**
 * Reports Core Web Vitals to our own endpoint.
 *
 * Uses Next's built-in useReportWebVitals rather than @vercel/speed-insights:
 * this app is self-hosted (next.config.ts sets output: "standalone"), and
 * Speed Insights only reports from a Vercel deployment — off Vercel it loads a
 * script and collects nothing. This costs no new dependency and, being
 * same-origin, needs no CSP connect-src change.
 *
 * Renders nothing.
 */
export default function WebVitals() {
  useReportWebVitals((metric) => {
    // next/web-vitals also emits custom Next timings (hydration, route-change).
    // Only the standard CWV set is meaningful here.
    if (!isWebVitalMetric(metric.name)) return;

    try {
      void fetch("/api/marketing/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metric: metric.name,
          value: metric.value,
          path: window.location.pathname,
        }),
        // Metrics are frequently reported as the page is being unloaded.
        keepalive: true,
      }).catch(() => {
        /* best-effort */
      });
    } catch {
      /* best-effort */
    }
  });

  return null;
}
