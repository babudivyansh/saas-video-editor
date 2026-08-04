import { describe, expect, it } from "vitest";
import { METRIC_KEYS, type MetricKey } from "../capabilities";
import type { KpiSet } from "../metrics/kpis";
import { kpiRows, kpiValue, defaultTitle, shortCaption, type ReportModel } from "./data";
import { renderCsv } from "./csv";
import { renderXlsx } from "./xlsx";
import { renderPdf } from "./pdf";
import { renderLineChartPng } from "./chart-image";

function kpis(over: Partial<Record<MetricKey, Partial<KpiSet[MetricKey]>>> = {}): KpiSet {
  const set = {} as KpiSet;
  for (const metric of METRIC_KEYS) {
    set[metric] = {
      metric,
      available: "native",
      unit: "count",
      current: null,
      previous: null,
      deltaPct: null,
      ...over[metric],
    } as KpiSet[MetricKey];
  }
  return set;
}

const MODEL: ReportModel = {
  title: "Monthly performance report",
  period: "monthly",
  periodStart: new Date("2026-07-01T00:00:00Z"),
  periodEnd: new Date("2026-08-01T00:00:00Z"),
  generatedAt: new Date("2026-08-04T09:00:00Z"),
  sections: ["kpis", "trends", "content", "audience", "competitors", "ai"],
  accounts: [
    {
      id: "acc1",
      provider: "instagram",
      label: "@clipiro",
      followers: 12_000,
      healthScore: 62,
      kpis: kpis({
        followers: { current: 12_000, previous: 11_000, deltaPct: 9.1 },
        reach: { available: "unavailable", reason: "Not reported by this platform." },
      }),
      series: [
        {
          metric: "followers",
          points: [
            { date: "2026-07-01", value: 11_000 },
            { date: "2026-07-15", value: 11_500 },
            { date: "2026-08-01", value: 12_000 },
          ],
        },
      ],
      topPosts: [
        {
          id: "p1",
          caption: "=cmd|'/c calc'!A1",
          mediaType: "reel",
          publishedAt: new Date("2026-07-20T10:00:00Z"),
          views: 8_200,
          reach: 7_000,
          likes: 400,
          comments: 30,
          shares: 12,
          saves: 40,
          engagementRate: 5.5,
          viralScore: 74,
          permalink: "https://example.com/p1",
        },
      ],
      contentMix: [{ type: "reel", count: 4, avgEngagementRate: 5.1 }],
      audience: [{ audience: "followers", dimension: "age", bucket: "18-24", value: 44, unit: "percent" }],
    },
  ],
  platforms: [],
  competitors: [
    {
      id: "c1", handle: "rival", provider: "instagram", followers: 25_000,
      followerGap: 13_000, engagementRate: 3.1, postsPerWeek: 5, weekGrowth: 500,
    },
  ],
  goals: [
    {
      metric: "followers", goalId: "g1", pct: 40, current: 12_000, target: 15_000, baseline: 10_000,
      onTrack: false, daysRemaining: 20, requiredDailyRate: 150, actualDailyRate: 60,
      projectedHitAt: null, hit: false, overdue: false,
    },
  ],
  ai: {
    summary: "Followers grew steadily while engagement held flat.",
    wins: ["Reels outperformed statics"],
    concerns: ["Posting cadence slipped"],
    recommendations: [{ title: "Publish two reels a week", rationale: "Reels carried the month." }],
  },
};

describe("report data helpers", () => {
  it("renders an unavailable metric as 'not reported', never as 0", () => {
    const rows = kpiRows(MODEL.accounts[0]);
    expect(rows.find((r) => r.metric === "Reach")?.value).toBe("not reported");
  });

  it("renders a metric with no data as an em dash", () => {
    expect(kpiValue(kpis().likes)).toBe("—");
  });

  it("includes unavailable metrics rather than hiding them", () => {
    // A report that omits them looks complete while concealing that a platform
    // never supplied half of it.
    expect(kpiRows(MODEL.accounts[0]).some((r) => r.value === "not reported")).toBe(true);
  });

  it("titles a report by its period and window", () => {
    expect(defaultTitle("monthly", MODEL.periodStart, MODEL.periodEnd)).toBe(
      "Monthly performance report, 2026-07-01 to 2026-08-01",
    );
  });

  it("keeps an empty caption legible rather than blank", () => {
    expect(shortCaption(null)).toBe("(no caption)");
    expect(shortCaption("  a   b  ")).toBe("a b");
  });
});

describe("renderCsv", () => {
  const csv = renderCsv(MODEL);

  it("neutralises a caption that a spreadsheet would execute", () => {
    expect(csv).toContain("'=cmd|'/c calc'!A1");
  });

  it("carries the BOM so Excel reads it as UTF-8", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("labels every block it emits", () => {
    expect(csv).toContain("@clipiro (instagram) — metrics");
    expect(csv).toContain("@clipiro — top posts");
    expect(csv).toContain("Competitors");
    expect(csv).toContain("Goals");
  });

  it("omits sections the report did not ask for", () => {
    const kpisOnly = renderCsv({ ...MODEL, sections: ["kpis"] });
    expect(kpisOnly).toContain("— metrics");
    expect(kpisOnly).not.toContain("top posts");
  });
});

describe("renderXlsx", () => {
  it("produces a real workbook", async () => {
    const buffer = await renderXlsx(MODEL);
    // PK zip magic — an xlsx that is not a zip is not an xlsx.
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buffer.byteLength).toBeGreaterThan(2_000);
  });

  it("survives an account label longer than Excel's sheet-name limit", async () => {
    const longLabel = "a".repeat(60);
    await expect(
      renderXlsx({
        ...MODEL,
        accounts: [{ ...MODEL.accounts[0], label: longLabel }],
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe("renderPdf", () => {
  it("produces a real PDF", async () => {
    const buffer = await renderPdf(MODEL);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(1_000);
  });

  it("renders with no accounts at all rather than throwing", async () => {
    const buffer = await renderPdf({ ...MODEL, accounts: [], competitors: [], goals: [] });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("renderLineChartPng", () => {
  it("returns a PNG for a real series", () => {
    const png = renderLineChartPng([
      { label: "Followers", color: "#335cff", points: MODEL.accounts[0].series[0].points },
    ]);
    expect(png?.subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("returns null rather than empty axes when there is nothing to draw", () => {
    // Empty axes in a report read as "we measured zero", which is a different
    // and wrong claim.
    expect(renderLineChartPng([])).toBeNull();
    expect(renderLineChartPng([{ label: "x", color: "#000", points: [{ date: "2026-08-01", value: 1 }] }])).toBeNull();
  });

  it("does not divide by zero on a flat series", () => {
    const png = renderLineChartPng([
      {
        label: "flat",
        color: "#000",
        points: [{ date: "2026-08-01", value: 5 }, { date: "2026-08-02", value: 5 }],
      },
    ]);
    expect(png).not.toBeNull();
  });
});
