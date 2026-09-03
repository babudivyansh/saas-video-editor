"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import AdminShell from "../../AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import { BRAND, PALETTE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, ChartContainer, ErrorCard, Skeleton } from "../../dashboard/ui";
import { Donut, HBars } from "../../dashboard/charts";
import { featureUsedLabel } from "@/lib/reviews/constants";

const GRID = "var(--line)";
const AXIS_TICK = { fontSize: 10, fill: "var(--fg-subtle)" } as const;
const RANGES = [7, 30, 90, 365] as const;

interface Analytics {
  range: number;
  totalReviews: number;
  openReportsCount: number;
  submissionsOverTime: { date: string; count: number }[];
  avgRatingTrend: { date: string; avg: number }[];
  ratingDistribution: { rating: number; count: number }[];
  mostReviewedFeatures: { featureUsed: string; count: number; avgRating: number }[];
  sentiment: { positive: number; neutral: number; negative: number };
  conversionRate: { eligibleUsers: number; reviewsSubmitted: number; rate: number };
  helpfulVoteTrend: { date: string; helpful: number; notHelpful: number }[];
  featureSatisfaction: { featureUsed: string; avgRating: number; count: number }[];
  mostLovedFeatures: { featureUsed: string; avgRating: number; count: number }[];
  churnCorrelation: { avgRatingChurned: number; avgRatingRetained: number; sampleSizeChurned: number; sampleSizeRetained: number };
  promptFunnel: { trigger: string; shown: number; dismissed: number; permanentDismiss: number; converted: number; dismissalRate: number; conversionRate: number }[];
  emailDripStats: {
    stage1: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    stage2: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    stage3: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    cancelledReviewed: number;
    cancelledOptedOut: number;
    totalSequences: number;
  };
  testimonialImpressions: { date: string; count: number }[];
}

const TRIGGER_LABEL: Record<string, string> = {
  export_complete: "Editor export",
  autoclips_milestone: "Auto Clips milestone",
  tool_generation_complete: "AI tool generation",
  billing_success: "Billing success",
  days_active: "Days-active nudge (cron)",
};

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-xl p-4 text-center">
      <p className="text-2xl font-extrabold text-fg">{value}</p>
      <p className="text-xs text-fg-subtle mt-0.5">{label}</p>
    </div>
  );
}

function weightedAverage(dist: { rating: number; count: number }[]): number {
  const total = dist.reduce((s, d) => s + d.count, 0);
  if (total === 0) return 0;
  const sum = dist.reduce((s, d) => s + d.rating * d.count, 0);
  return Math.round((sum / total) * 10) / 10;
}

export default function AdminReviewsAnalyticsPage() {
  const { token } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-review-analytics", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reviews/analytics?range=${range}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load analytics");
      return (await res.json()) as Analytics;
    },
    enabled: !!token,
  });

  return (
    <AdminShell title="Review Analytics">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <Link href="/admin/reviews" className="text-xs font-semibold text-fg-muted hover:text-fg">← Back to Reviews</Link>
        <div className="inline-flex bg-surface-3 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${range === r ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} h="h-20" />)}</div>
          <Skeleton h="h-64" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile label="Total reviews" value={data.totalReviews} />
            <KpiTile label="Avg rating" value={weightedAverage(data.ratingDistribution).toFixed(1)} />
            <KpiTile label="Conversion rate" value={`${data.conversionRate.rate}%`} />
            <KpiTile label="Open reports" value={data.openReportsCount} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartContainer
              title="Submissions over time"
              csv={{ filename: `review-submissions-${range}d.csv`, rows: data.submissionsOverTime.map((d) => ({ date: d.date, count: d.count })) }}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.submissionsOverTime} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Area type="monotone" dataKey="count" name="Submissions" stroke={BRAND} strokeWidth={2} fill={BRAND} fillOpacity={0.08} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartContainer>

            <ChartContainer
              title="Average rating trend"
              csv={{ filename: `review-rating-trend-${range}d.csv`, rows: data.avgRatingTrend.map((d) => ({ date: d.date, avg: d.avg })) }}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.avgRatingTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 5]} width={24} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Line type="monotone" dataKey="avg" name="Avg rating" stroke={PALETTE[3]} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartContainer>

            <ChartContainer
              title="Rating distribution"
              csv={{ filename: `review-rating-distribution-${range}d.csv`, rows: data.ratingDistribution.map((d) => ({ rating: d.rating, count: d.count })) }}
            >
              <HBars items={data.ratingDistribution.slice().reverse().map((d) => ({ label: `${d.rating}★`, value: d.count }))} />
            </ChartContainer>

            <ChartContainer title="Sentiment split" subtitle="Rating-bucket heuristic (4-5★/3★/1-2★), not NLP">
              <Donut
                slices={[
                  { name: "Positive (4-5★)", value: data.sentiment.positive },
                  { name: "Neutral (3★)", value: data.sentiment.neutral },
                  { name: "Negative (1-2★)", value: data.sentiment.negative },
                ]}
                centerLabel="reviews"
                centerValue={String(data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative)}
              />
            </ChartContainer>

            <ChartContainer
              title="Most reviewed features"
              csv={{ filename: `review-features-${range}d.csv`, rows: data.mostReviewedFeatures.map((f) => ({ feature: featureUsedLabel(f.featureUsed), count: f.count, avgRating: f.avgRating })) }}
            >
              <HBars items={data.mostReviewedFeatures.map((f) => ({ label: featureUsedLabel(f.featureUsed), value: f.count }))} />
            </ChartContainer>

            <ChartContainer
              title="Helpful vote trend"
              csv={{ filename: `review-helpful-votes-${range}d.csv`, rows: data.helpfulVoteTrend.map((d) => ({ date: d.date, helpful: d.helpful, notHelpful: d.notHelpful })) }}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.helpfulVoteTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Bar dataKey="helpful" name="Helpful" fill={BRAND} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="notHelpful" name="Not helpful" fill={PALETTE[4]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartContainer>

            <ChartContainer
              title="Most-loved features"
              subtitle="Same underlying data as feature satisfaction, sorted by average rating"
              csv={{ filename: `review-most-loved-features-${range}d.csv`, rows: data.mostLovedFeatures.map((f) => ({ feature: featureUsedLabel(f.featureUsed), avgRating: f.avgRating, count: f.count })) }}
            >
              <HBars items={data.mostLovedFeatures.map((f) => ({ label: featureUsedLabel(f.featureUsed), value: f.avgRating }))} valueFmt={(n) => `${n.toFixed(1)}★`} />
            </ChartContainer>

            <ChartContainer
              title="Testimonial-section impressions"
              subtitle="Anonymous, aggregate-only — how often the landing page's testimonial section is scrolled into view"
              csv={{ filename: `testimonial-impressions-${range}d.csv`, rows: data.testimonialImpressions.map((d) => ({ date: d.date, count: d.count })) }}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.testimonialImpressions} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Area type="monotone" dataKey="count" name="Impressions" stroke={PALETTE[2]} strokeWidth={2} fill={PALETTE[2]} fillOpacity={0.08} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartContainer>
          </div>

          <ChartContainer title="Review-prompt funnel" subtitle="Per trigger: how many popups were shown, dismissed, and converted to a submitted review">
            {data.promptFunnel.length === 0 ? (
              <p className="text-xs text-fg-subtle py-6 text-center">No prompts shown in range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <th className="pb-2 pr-4 font-semibold">Trigger</th>
                      <th className="pb-2 pr-4 font-semibold text-right">Shown</th>
                      <th className="pb-2 pr-4 font-semibold text-right">Dismissed</th>
                      <th className="pb-2 pr-4 font-semibold text-right">Dismissal rate</th>
                      <th className="pb-2 pr-4 font-semibold text-right">Converted</th>
                      <th className="pb-2 font-semibold text-right">Conversion rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.promptFunnel.map((row) => (
                      <tr key={row.trigger}>
                        <td className="py-2 pr-4 font-semibold text-fg">{TRIGGER_LABEL[row.trigger] ?? row.trigger}</td>
                        <td className="py-2 pr-4 text-right text-fg-muted">{row.shown}</td>
                        <td className="py-2 pr-4 text-right text-fg-muted">{row.dismissed}</td>
                        <td className="py-2 pr-4 text-right text-fg-muted">{row.dismissalRate}%</td>
                        <td className="py-2 pr-4 text-right text-fg-muted">{row.converted}</td>
                        <td className="py-2 text-right font-semibold text-fg">{row.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartContainer>

          <ChartContainer title="Email drip funnel" subtitle={`${data.emailDripStats.totalSequences} sequence(s) started in range — ${data.emailDripStats.cancelledReviewed} stopped by a submitted review, ${data.emailDripStats.cancelledOptedOut} by opt-out`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              {([
                ["Email 1 — Thank you", data.emailDripStats.stage1],
                ["Email 2 — Gentle reminder", data.emailDripStats.stage2],
                ["Email 3 — Final reminder", data.emailDripStats.stage3],
              ] as const).map(([label, stage]) => (
                <div key={label} className="bg-surface-2 rounded-xl p-4">
                  <p className="text-xs font-semibold text-fg-muted">{label}</p>
                  <p className="text-2xl font-extrabold text-fg mt-1">{stage.sent}</p>
                  <p className="text-[11px] text-fg-subtle">sent</p>
                  <div className="mt-2 flex items-center justify-center gap-3 text-xs text-fg-muted">
                    <span>{stage.openRate}% opened</span>
                    <span>·</span>
                    <span>{stage.clickRate}% clicked</span>
                  </div>
                </div>
              ))}
            </div>
          </ChartContainer>

          <ChartContainer title="Churn correlation" subtitle="Correlational only, not causal — a small/skewed sample can be misleading">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-surface-2 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-fg">{data.churnCorrelation.avgRatingRetained.toFixed(1)}★</p>
                <p className="text-xs text-fg-subtle mt-0.5">Active subscribers ({data.churnCorrelation.sampleSizeRetained} reviews)</p>
              </div>
              <div className="bg-surface-2 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-fg">{data.churnCorrelation.avgRatingChurned.toFixed(1)}★</p>
                <p className="text-xs text-fg-subtle mt-0.5">Churned/cancelled ({data.churnCorrelation.sampleSizeChurned} reviews)</p>
              </div>
            </div>
          </ChartContainer>
        </div>
      )}
    </AdminShell>
  );
}
