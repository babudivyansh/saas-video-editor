import { describe, expect, it } from "vitest";
import { bucketFor, isWebVitalMetric, normalizeVitalsPath } from "./web-vitals";

describe("bucketFor", () => {
  // Official web.dev thresholds. These are the numbers every chart built on
  // this data depends on, so they're asserted at the exact boundaries.
  it("uses the documented LCP thresholds inclusively", () => {
    expect(bucketFor("LCP", 2500)).toBe("good");
    expect(bucketFor("LCP", 2501)).toBe("needs_improvement");
    expect(bucketFor("LCP", 4000)).toBe("needs_improvement");
    expect(bucketFor("LCP", 4001)).toBe("poor");
  });

  it("uses the documented INP thresholds", () => {
    expect(bucketFor("INP", 200)).toBe("good");
    expect(bucketFor("INP", 500)).toBe("needs_improvement");
    expect(bucketFor("INP", 501)).toBe("poor");
  });

  // CLS is unitless, not milliseconds — a shared threshold table would get
  // this wrong by three orders of magnitude.
  it("treats CLS as a unitless score", () => {
    expect(bucketFor("CLS", 0.1)).toBe("good");
    expect(bucketFor("CLS", 0.2)).toBe("needs_improvement");
    expect(bucketFor("CLS", 0.3)).toBe("poor");
  });

  it("buckets a perfect zero as good for every metric", () => {
    for (const metric of ["LCP", "INP", "CLS", "FCP", "TTFB"] as const) {
      expect(bucketFor(metric, 0)).toBe("good");
    }
  });
});

describe("isWebVitalMetric", () => {
  it("accepts the standard CWV set", () => {
    for (const metric of ["LCP", "INP", "CLS", "FCP", "TTFB"]) {
      expect(isWebVitalMetric(metric)).toBe(true);
    }
  });

  // next/web-vitals also emits Next-specific timings; recording those as CWV
  // would pollute the table.
  it("rejects Next's custom timings and anything else", () => {
    for (const name of ["Next.js-hydration", "Next.js-route-change-to-render", "FID", "lcp", ""]) {
      expect(isWebVitalMetric(name)).toBe(false);
    }
  });
});

describe("normalizeVitalsPath", () => {
  // Without collapsing, every published article becomes its own row and the
  // aggregate is useless.
  it("collapses dynamic segments to route patterns", () => {
    expect(normalizeVitalsPath("/blog/podcast-to-viral-clips")).toBe("/blog/[slug]");
    expect(normalizeVitalsPath("/blog/category/growth")).toBe("/blog/category/[slug]");
    expect(normalizeVitalsPath("/blog/author/clipiro-team")).toBe("/blog/author/[slug]");
    expect(normalizeVitalsPath("/reviews/abc-123")).toBe("/reviews/[id]");
  });

  it("leaves static routes alone", () => {
    expect(normalizeVitalsPath("/blog")).toBe("/blog");
    expect(normalizeVitalsPath("/pricing")).toBe("/pricing");
    expect(normalizeVitalsPath("/")).toBe("/");
  });

  // Query strings can carry PII and this table is meant to be anonymous.
  it("drops query strings and fragments", () => {
    expect(normalizeVitalsPath("/blog?email=someone@example.com")).toBe("/blog");
    expect(normalizeVitalsPath("/blog/x?utm_source=a#section")).toBe("/blog/[slug]");
  });

  it("normalizes trailing slashes so they don't split a row in two", () => {
    expect(normalizeVitalsPath("/blog/")).toBe("/blog");
    expect(normalizeVitalsPath("/")).toBe("/");
  });

  it("bounds the stored length", () => {
    expect(normalizeVitalsPath(`/${"a".repeat(500)}`).length).toBeLessThanOrEqual(128);
  });
});
