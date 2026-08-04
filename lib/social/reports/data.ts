// The report model: one plain object that CSV, XLSX and PDF all render from.
//
// Pure. Assembly from the database happens in index.ts; everything here is a
// transform over values that were already computed by lib/social/metrics. That
// separation is what makes "the PDF disagrees with the dashboard" impossible to
// introduce by accident — there is one set of numbers and three renderers.

import type { MetricKey } from "../capabilities";
import type { Kpi, KpiSet } from "../metrics/kpis";
import type { Period } from "../metrics/dates";
import type { ContentTypeBreakdown } from "../metrics/posts";
import type { CompetitorComparison, PlatformComparisonRow } from "../metrics/compare";
import type { GoalProgress } from "../metrics/goals";
import { METRIC_LABELS } from "../ai/factsheets";

export type ReportSection = "kpis" | "trends" | "content" | "audience" | "competitors" | "ai";

export interface ReportPost {
  id: string;
  caption: string | null;
  mediaType: string | null;
  publishedAt: Date | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
  viralScore: number | null;
  permalink: string | null;
}

export interface ReportAccount {
  id: string;
  provider: string;
  label: string;
  followers: number | null;
  healthScore: number | null;
  kpis: KpiSet;
  series: Array<{ metric: MetricKey; points: Array<{ date: string; value: number }> }>;
  topPosts: ReportPost[];
  contentMix: ContentTypeBreakdown[];
  audience: Array<{ audience: string; dimension: string; bucket: string; value: number; unit: string }>;
}

export interface ReportAi {
  summary: string;
  wins: string[];
  concerns: string[];
  recommendations: Array<{ title: string; rationale: string }>;
}

export interface ReportModel {
  title: string;
  period: Period | "custom";
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  sections: ReportSection[];
  accounts: ReportAccount[];
  platforms: PlatformComparisonRow[];
  competitors: CompetitorComparison[];
  goals: Array<GoalProgress & { metric: string }>;
  ai: ReportAi | null;
}

// ── Presentation helpers, shared by all three renderers ─────────────────────

export const EM_DASH = "—";

/** A KPI's display value. Null renders as an em dash; never as 0. */
export function kpiValue(kpi: Kpi | undefined): string {
  if (!kpi || kpi.available === "unavailable") return "not reported";
  if (kpi.current === null) return EM_DASH;
  switch (kpi.unit) {
    case "percent":
      return `${kpi.current.toFixed(1)}%`;
    case "seconds":
      return formatDuration(kpi.current);
    case "ratio":
      return kpi.current.toFixed(2);
    case "score":
      return kpi.current.toFixed(0);
    default:
      return Intl.NumberFormat("en").format(Math.round(kpi.current));
  }
}

export function kpiChange(kpi: Kpi | undefined): string {
  if (!kpi || kpi.deltaPct === null) return EM_DASH;
  return `${kpi.deltaPct >= 0 ? "+" : ""}${kpi.deltaPct.toFixed(1)}%`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function metricLabel(metric: MetricKey): string {
  return METRIC_LABELS[metric] ?? metric;
}

/** Metrics a report leads with, in the order a reader wants them. */
export const HEADLINE_METRICS: MetricKey[] = [
  "followers",
  "followersGained",
  "reach",
  "views",
  "engagementRate",
  "totalInteractions",
  "postsPublished",
];

/**
 * KPI rows for one account, headline metrics first.
 *
 * Unavailable metrics are INCLUDED, marked "not reported". A report that
 * silently omits them looks complete while hiding that a platform never
 * supplied half of it — the reader has no way to tell a zero from a gap.
 */
export function kpiRows(account: ReportAccount): Array<{ metric: string; value: string; change: string }> {
  const rest = (Object.keys(account.kpis) as MetricKey[]).filter((m) => !HEADLINE_METRICS.includes(m));
  return [...HEADLINE_METRICS, ...rest].map((metric) => ({
    metric: metricLabel(metric),
    value: kpiValue(account.kpis[metric]),
    change: kpiChange(account.kpis[metric]),
  }));
}

/** Human title for a report covering this window. */
export function defaultTitle(period: Period | "custom", start: Date, end: Date): string {
  const window = `${formatDate(start)} to ${formatDate(end)}`;
  return period === "custom" ? `Performance report, ${window}` : `${capitalise(period)} performance report, ${window}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A caption trimmed for a table cell, with newlines flattened. */
export function shortCaption(caption: string | null, max = 60): string {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return "(no caption)";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
