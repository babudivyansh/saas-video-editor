// Factsheets: the plain-text tables of REAL, already-computed numbers that every
// social AI prompt embeds.
//
// This module is pure. It imports no prisma, no redis, no fetch and no clock —
// callers pass rows and derived structures in, and get strings out. That is
// deliberate and it is load-bearing: the factsheet is the contract that must
// never lie, so it has to be the cheapest thing in the system to unit-test.
// `factsheets.test.ts` pins the exact strings.
//
// Two rules the builders follow everywhere:
//   1. A null is rendered as "unknown", never as 0. "We have no number" and
//      "the number is zero" are different facts and the model must see which.
//   2. Metrics the platform cannot report are listed explicitly, so the model
//      is told what is missing rather than left to fill the silence.

import type { MetricKey, MetricUnit } from "../capabilities";
import type { AccountAlert } from "../metrics/alerts";
import type { BenchmarkResult, CompetitorComparison, PlatformComparisonRow } from "../metrics/compare";
import type { Period } from "../metrics/dates";
import type { Forecast } from "../metrics/forecast";
import type { GoalProgress } from "../metrics/goals";
import type { DerivedKpis, Kpi, KpiSet } from "../metrics/kpis";
import type { ContentTypeBreakdown } from "../metrics/posts";
import type { PostScoreComponents } from "../metrics/scores";
import type { BestTimeCell, PostingConsistency } from "../metrics/timing";
import { PROVIDER_LABELS, type ProviderId } from "../types";
import { HOUR_BLOCKS, WEEKDAYS } from "./schemas";

export type FactsheetKind =
  | "account"
  | "kpi"
  | "content"
  | "post-batch"
  | "schedule"
  | "growth";

export interface Factsheet {
  kind: FactsheetKind;
  /** One fact per line. Rendered verbatim into the prompt. */
  lines: string[];
}

/** The prompt-ready form. Kept separate so tests can assert line by line. */
export function renderFactsheet(sheet: Factsheet): string {
  return sheet.lines.join("\n");
}

// ── Formatting ───────────────────────────────────────────────────────────────

export const UNKNOWN = "unknown";

export function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNKNOWN;
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNKNOWN;
  return `${n.toFixed(1)}%`;
}

export function fmtSeconds(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNKNOWN;
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function fmtByUnit(value: number | null | undefined, unit: MetricUnit): string {
  switch (unit) {
    case "percent":
      return fmtPercent(value);
    case "seconds":
      return fmtSeconds(value);
    case "ratio":
      return value === null || value === undefined || !Number.isFinite(value)
        ? UNKNOWN
        : value.toFixed(2);
    case "score":
      return value === null || value === undefined || !Number.isFinite(value)
        ? UNKNOWN
        : value.toFixed(1);
    default:
      return fmtCount(value);
  }
}

/** Signed change, or an explicit "no comparison data" — never a bare 0%. */
export function fmtDelta(deltaPct: number | null | undefined): string {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
    return "no comparison data";
  }
  return `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs previous period`;
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Human names for the metric keys the model is allowed to reference. */
export const METRIC_LABELS: Record<MetricKey, string> = {
  followers: "Followers",
  followersGained: "Followers gained",
  followersLost: "Followers lost",
  followerGrowthRate: "Follower growth rate",
  impressions: "Impressions",
  reach: "Reach",
  views: "Views",
  plays: "Plays",
  engagementRate: "Engagement rate",
  totalInteractions: "Total interactions",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  profileViews: "Profile visits",
  websiteClicks: "Website clicks",
  ctr: "Click-through rate",
  watchTimeSec: "Watch time",
  avgViewDurationSec: "Average view duration",
  avgViewPercentage: "Average view percentage",
  postsPublished: "Posts published",
  postingFrequency: "Posting frequency (posts/day)",
  viralScore: "Viral score",
  healthScore: "Health score",
};

const PERIOD_LABELS: Record<Period, string> = {
  weekly: "the last week",
  monthly: "the last month",
  quarterly: "the last quarter",
  annual: "the last year",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider as ProviderId] ?? provider;
}

/** `Followers: 1.1K (+10.0% vs previous period)`, or nothing when unknown. */
function kpiLine(kpi: Kpi): string | null {
  if (kpi.available === "unavailable" || kpi.current === null) return null;
  return `${METRIC_LABELS[kpi.metric]}: ${fmtByUnit(kpi.current, kpi.unit)} (${fmtDelta(kpi.deltaPct)})`;
}

/** The metrics with real values, in METRIC_LABELS order. */
function kpiLines(kpis: KpiSet): string[] {
  const out: string[] = [];
  for (const key of Object.keys(METRIC_LABELS) as MetricKey[]) {
    const line = kpis[key] ? kpiLine(kpis[key]) : null;
    if (line) out.push(line);
  }
  return out;
}

/**
 * The two ways a metric can be absent, stated separately.
 *
 * Collapsing them is exactly the bug the capability matrix exists to prevent:
 * "this platform never reports reach" is a fact about YouTube, "no reach data
 * yet" is a fact about this account's sync, and a model told neither will
 * cheerfully invent a reach number.
 */
function absenceLines(kpis: KpiSet): string[] {
  const unavailable: string[] = [];
  const noData: string[] = [];
  for (const key of Object.keys(METRIC_LABELS) as MetricKey[]) {
    const kpi = kpis[key];
    if (!kpi) continue;
    if (kpi.available === "unavailable") unavailable.push(METRIC_LABELS[key]);
    else if (kpi.current === null) noData.push(METRIC_LABELS[key]);
  }
  const out: string[] = [];
  if (unavailable.length > 0) {
    out.push(`Not reported by this platform (do not mention or estimate): ${unavailable.join(", ")}`);
  }
  if (noData.length > 0) {
    out.push(`No data collected yet for: ${noData.join(", ")}`);
  }
  return out;
}

// ── Account factsheet — executive summaries, growth coaching ─────────────────

export interface TopPostFact {
  id: string;
  caption?: string | null;
  mediaType?: string | null;
  publishedAt?: Date | null;
  /** Views or reach, whichever the platform reports. */
  audience: number | null;
  audienceLabel: "views" | "reach";
  engagementRate: number | null;
  score: PostScoreComponents | null;
}

export interface AccountFactsheetInput {
  provider: string;
  /** The channel/handle name, so multi-account summaries can tell them apart. */
  label?: string | null;
  period: Period;
  windowStart: Date;
  windowEnd: Date;
  kpis: KpiSet;
  derived?: DerivedKpis | null;
  health?: { score: number; confidence: number; components: Array<{ label: string; value: number | null }> } | null;
  benchmark?: BenchmarkResult | null;
  contentMix?: ContentTypeBreakdown[];
  topPosts?: TopPostFact[];
  bestSlot?: BestTimeCell | null;
  alerts?: AccountAlert[];
}

export function buildAccountFactsheet(input: AccountFactsheetInput): Factsheet {
  const lines: string[] = [
    `Platform: ${providerLabel(input.provider)}${input.label ? ` — ${input.label}` : ""}`,
    `Period: ${PERIOD_LABELS[input.period]}, ${fmtDate(input.windowStart)} to ${fmtDate(input.windowEnd)}, each metric compared with the equal-length window before it`,
    ...kpiLines(input.kpis),
  ];

  if (input.derived) {
    lines.push(
      `Average views per post: ${fmtCount(input.derived.averageViews.current)} (${fmtDelta(input.derived.averageViews.deltaPct)})`,
      `Follower growth: daily ${fmtPercent(input.derived.dailyGrowth)}, weekly ${fmtPercent(input.derived.weeklyGrowth)}, monthly ${fmtPercent(input.derived.monthlyGrowth)}`,
    );
  }

  if (input.health) {
    const parts = input.health.components
      .map((c) => `${c.label} ${c.value === null ? UNKNOWN : c.value.toFixed(0)}`)
      .join(", ");
    lines.push(
      `Health score: ${input.health.score.toFixed(0)}/100 (confidence ${(input.health.confidence * 100).toFixed(0)}%) — ${parts}`,
    );
  }

  if (input.benchmark && input.benchmark.verdict !== "unknown") {
    lines.push(
      `Engagement rate vs typical ${providerLabel(input.provider)} accounts: ${input.benchmark.verdict} (typical band ${fmtPercent(input.benchmark.low)} to ${fmtPercent(input.benchmark.high)})`,
    );
  }

  if (input.contentMix && input.contentMix.length > 0) {
    lines.push(
      `Content mix: ${input.contentMix
        .map((c) => `${c.type} x${c.count} (avg engagement rate ${fmtPercent(c.avgEngagementRate)})`)
        .join(", ")}`,
    );
  }

  for (const [i, p] of (input.topPosts ?? []).entries()) {
    lines.push(
      `Top post ${i + 1}: "${captionOf(p.caption)}" — ${fmtCount(p.audience)} ${p.audienceLabel}, engagement rate ${fmtPercent(p.engagementRate)}${
        p.score ? `, performance score ${p.score.score.toFixed(1)}/100` : ""
      }`,
    );
  }

  if (input.bestSlot) {
    lines.push(
      `Best posting slot observed: ${WEEKDAYS[input.bestSlot.day]} ${HOUR_BLOCKS[input.bestSlot.block]} (avg engagement rate ${fmtPercent(input.bestSlot.avgEngagementRate)} over ${input.bestSlot.count} posts)`,
    );
  }

  for (const alert of input.alerts ?? []) lines.push(`Signal: ${alert.message}`);

  lines.push(...absenceLines(input.kpis));
  return { kind: "account", lines };
}

function consistencyLine(c: PostingConsistency): string {
  const n = (v: number | null, digits: number) => (v === null ? UNKNOWN : v.toFixed(digits));
  return `Posting consistency: ${n(c.score, 0)}/100, average gap ${n(c.avgGapDays, 1)} days (std dev ${n(c.gapStdDevDays, 1)}), last post ${n(c.daysSinceLastPost, 0)} days ago`;
}

const CAPTION_MAX = 90;

function captionOf(caption?: string | null): string {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return "untitled";
  return text.length > CAPTION_MAX ? `${text.slice(0, CAPTION_MAX)}…` : text;
}

// ── KPI factsheet — the free, cached "why did this move?" explainer ──────────

export interface KpiFactsheetInput {
  provider: string;
  metric: MetricKey;
  kpi: Kpi;
  windowStart: Date;
  windowEnd: Date;
  /** Metrics that plausibly explain the movement — posts published, reach, … */
  context: Kpi[];
  contentMix?: ContentTypeBreakdown[];
}

export function buildKpiFactsheet(input: KpiFactsheetInput): Factsheet {
  const lines: string[] = [
    `Platform: ${providerLabel(input.provider)}`,
    `Window: ${fmtDate(input.windowStart)} to ${fmtDate(input.windowEnd)}, compared with the equal-length window before it`,
    `Metric in question: ${METRIC_LABELS[input.metric]}`,
  ];

  if (input.kpi.available === "unavailable") {
    lines.push(`This platform does not report ${METRIC_LABELS[input.metric]}: ${input.kpi.reason ?? "no reason recorded"}`);
    return { kind: "kpi", lines };
  }

  lines.push(
    `Current: ${fmtByUnit(input.kpi.current, input.kpi.unit)}`,
    `Previous: ${fmtByUnit(input.kpi.previous, input.kpi.unit)}`,
    `Change: ${fmtDelta(input.kpi.deltaPct)}`,
  );

  for (const kpi of input.context) {
    const line = kpiLine(kpi);
    if (line) lines.push(`Context — ${line}`);
  }

  if (input.contentMix && input.contentMix.length > 0) {
    lines.push(
      `Content mix: ${input.contentMix
        .map((c) => `${c.type} x${c.count} (avg engagement rate ${fmtPercent(c.avgEngagementRate)})`)
        .join(", ")}`,
    );
  }
  return { kind: "kpi", lines };
}

// ── Content factsheet — what to make next ───────────────────────────────────

export interface ContentFactsheetInput {
  provider: string;
  windowStart: Date;
  windowEnd: Date;
  posts: TopPostFact[];
  contentMix?: ContentTypeBreakdown[];
  bestSlots?: BestTimeCell[];
  consistency?: PostingConsistency | null;
  kpis?: KpiSet | null;
}

export function buildContentFactsheet(input: ContentFactsheetInput): Factsheet {
  const lines: string[] = [
    `Platform: ${providerLabel(input.provider)}`,
    `Window: ${fmtDate(input.windowStart)} to ${fmtDate(input.windowEnd)}`,
    `Posts analysed: ${input.posts.length}`,
  ];

  if (input.contentMix && input.contentMix.length > 0) {
    lines.push(
      `Content mix: ${input.contentMix
        .map((c) => `${c.type} x${c.count} (avg engagement rate ${fmtPercent(c.avgEngagementRate)})`)
        .join(", ")}`,
    );
  }

  for (const p of input.posts) {
    lines.push(
      `Post ${p.id}: "${captionOf(p.caption)}" [${p.mediaType ?? "unknown type"}${
        p.publishedAt ? `, ${fmtDate(p.publishedAt)}` : ""
      }] — ${fmtCount(p.audience)} ${p.audienceLabel}, engagement rate ${fmtPercent(p.engagementRate)}${
        p.score
          ? `, score ${p.score.score.toFixed(1)}/100 (reach percentile ${p.score.reach.toFixed(0)}, engagement percentile ${p.score.engagement.toFixed(0)}, shares percentile ${p.score.shares.toFixed(0)}, retention percentile ${p.score.retention === null ? UNKNOWN : p.score.retention.toFixed(0)})`
          : ", score unavailable (too few comparable posts)"
      }`,
    );
  }

  for (const slot of input.bestSlots ?? []) {
    lines.push(
      `Strong slot: ${WEEKDAYS[slot.day]} ${HOUR_BLOCKS[slot.block]} (avg engagement rate ${fmtPercent(slot.avgEngagementRate)} over ${slot.count} posts)`,
    );
  }

  if (input.consistency) {
    lines.push(consistencyLine(input.consistency));
  }

  if (input.kpis) lines.push(...absenceLines(input.kpis));
  return { kind: "content", lines };
}

// ── Post batch factsheet — narration, 10 posts per model call ───────────────

export interface PostBatchFactsheetInput {
  provider: string;
  posts: TopPostFact[];
  /** Cohort size the percentiles were computed against, for honesty about noise. */
  cohortSize: number;
}

export function buildPostBatchFactsheet(input: PostBatchFactsheetInput): Factsheet {
  const lines: string[] = [
    `Platform: ${providerLabel(input.provider)}`,
    `Each post below is scored against the ${input.cohortSize} comparable posts published near it. Percentiles are already computed; do not recompute them.`,
  ];
  for (const p of input.posts) {
    lines.push(
      `postId=${p.id} | caption="${captionOf(p.caption)}" | type=${p.mediaType ?? "unknown"} | ${p.audienceLabel}=${fmtCount(p.audience)} | engagementRate=${fmtPercent(p.engagementRate)} | score=${
        p.score ? `${p.score.score.toFixed(1)}/100` : UNKNOWN
      }`,
    );
  }
  return { kind: "post-batch", lines };
}

// ── Schedule factsheet ──────────────────────────────────────────────────────

export interface ScheduleFactsheetInput {
  provider: string;
  slots: BestTimeCell[];
  consistency?: PostingConsistency | null;
  /** Minimum posts behind a slot before it is worth trusting. */
  minSampleSize: number;
  timezone: string;
}

export function buildScheduleFactsheet(input: ScheduleFactsheetInput): Factsheet {
  const lines: string[] = [
    `Platform: ${providerLabel(input.provider)}`,
    `All times are in ${input.timezone}.`,
    `Slots with fewer than ${input.minSampleSize} posts behind them are not reliable and are excluded below.`,
  ];
  if (input.slots.length === 0) {
    lines.push("No slot has enough posts behind it yet to rank.");
  }
  for (const slot of input.slots) {
    lines.push(
      `${WEEKDAYS[slot.day]} ${HOUR_BLOCKS[slot.block]}: avg engagement rate ${fmtPercent(slot.avgEngagementRate)} over ${slot.count} posts`,
    );
  }
  if (input.consistency) {
    lines.push(consistencyLine(input.consistency));
  }
  return { kind: "schedule", lines };
}

// ── Growth factsheet — forecast, goals, competitors ─────────────────────────

export interface GrowthFactsheetInput {
  provider: string;
  kpis: KpiSet;
  forecast?: (Forecast & { metric: MetricKey }) | null;
  goals?: Array<GoalProgress & { metric: string }>;
  competitors?: CompetitorComparison[];
  platforms?: PlatformComparisonRow[];
}

export function buildGrowthFactsheet(input: GrowthFactsheetInput): Factsheet {
  const lines: string[] = [`Platform: ${providerLabel(input.provider)}`, ...kpiLines(input.kpis)];

  const f = input.forecast;
  if (f && f.points.length > 0) {
    const last = f.points[f.points.length - 1];
    const lastLower = f.lower[f.lower.length - 1];
    const lastUpper = f.upper[f.upper.length - 1];
    lines.push(
      `Forecast (${METRIC_LABELS[f.metric]}, damped trend, fit quality ${f.r2.toFixed(2)}): ${fmtCount(last.value)} by ${fmtDate(new Date(last.date))}, plausible range ${fmtCount(lastLower?.value ?? null)} to ${fmtCount(lastUpper?.value ?? null)}`,
    );
    if (f.r2 < 0.3) lines.push("Forecast fit is weak — treat the projection as indicative only.");
  }

  for (const g of input.goals ?? []) {
    lines.push(
      `Goal (${g.metric}): ${fmtCount(g.current)} of ${fmtCount(g.target)}, ${g.pct === null ? UNKNOWN : `${g.pct.toFixed(0)}% done`}, ${g.daysRemaining} days remaining, ${
        g.hit ? "already hit" : g.onTrack === null ? "pace unknown" : g.onTrack ? "on track" : "behind pace"
      }${g.projectedHitAt ? `, projected to land ${fmtDate(g.projectedHitAt)}` : ""}`,
    );
  }

  for (const c of input.competitors ?? []) {
    lines.push(
      `Competitor @${c.handle} (${providerLabel(c.provider)}): ${fmtCount(c.followers)} followers (gap ${fmtCount(c.followerGap)}), engagement rate ${fmtPercent(c.engagementRate)}, ${c.postsPerWeek === null ? UNKNOWN : c.postsPerWeek.toFixed(1)} posts/week`,
    );
  }

  for (const p of input.platforms ?? []) {
    lines.push(
      `Own account ${p.label} (${providerLabel(p.provider)}): ${fmtCount(p.followers)} followers, ${fmtPercent(p.followerShare)} of total audience, engagement rate ${fmtPercent(p.engagementRate)}`,
    );
  }

  lines.push(...absenceLines(input.kpis));
  return { kind: "growth", lines };
}
