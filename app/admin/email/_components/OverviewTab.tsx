"use client";

// KPIs + charts for the selected range. Numbers come straight from
// app/api/admin/email/overview; the definitions line under the KPIs is the
// same text as lib/email/router/admin-queries.ts, so a reader knows exactly
// what "delivery rate" counts.

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartContainer, Kpi, PALETTE, BRAND, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, compact } from "../../dashboard/ui";
import { CHART_AXIS_TICK as AXIS_TICK, CHART_GRID as GRID } from "@/app/components/dashboard/palette";
import { PROVIDER_LABEL, ms, type EmailOverview } from "./types";

const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
const intFmt = (v: number) => v.toLocaleString();

function label(t: string, granularity: "hour" | "day") {
  const d = new Date(t);
  return granularity === "hour"
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OverviewTab({ data }: { data: EmailOverview }) {
  const t = data.totals;
  const g = data.range.granularity;
  const series = data.series.map((s) => ({ ...s, label: label(s.t, g), other: Math.max(0, s.accepted - s.delivered) }));
  const today = data.providers.reduce((a, p) => a + p.daily.used, 0);
  const month = data.providers.reduce((a, p) => a + p.monthly.used, 0);
  const remaining = data.providers
    .filter((p) => p.enabled && p.configured && p.daily.remaining != null)
    .reduce((a, p) => a + (p.daily.remaining ?? 0), 0);
  const otp = data.byPriority.find((p) => p.priority === "critical")?.count ?? 0;
  const other = data.byPriority.filter((p) => p.priority !== "critical").reduce((a, p) => a + p.count, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Attempted" value={t.attempted} format={intFmt} sub="Messages the app asked to send" />
        <Kpi label="Accepted by a provider" value={t.accepted} format={intFmt} sub={t.acceptanceRate == null ? undefined : `${pctFmt(t.acceptanceRate)} of attempted`} />
        <Kpi label="Delivered (confirmed)" value={t.delivered} format={intFmt} sub="Reported by provider webhook" />
        <Kpi label="Failed" value={t.failed} format={intFmt} sub={`${t.bounced} bounced or spam`} />
        <Kpi label="Delivery rate" value={t.deliveryRate} format={pctFmt} sub={`${t.awaitingConfirmation} awaiting confirmation (excluded)`} />
        <Kpi label="Fallback rate" value={t.fallbackRate} format={pctFmt} sub="Accepted by a backup provider" />
        <Kpi label="Avg provider API time" value={t.avgApiLatencyMs} format={(v) => ms(v)} sub="Accepted attempts only" />
        <Kpi label="Estimated daily quota left" value={remaining} format={intFmt} sub={`${today} used today · ${month} this month`} />
      </div>

      <p className="text-xs text-fg-subtle leading-relaxed">
        <strong className="text-fg-muted">Accepted</strong> means a provider took the request — not that it arrived.{" "}
        <strong className="text-fg-muted">Delivery rate</strong> = confirmed delivered ÷ (delivered + bounced + failed). Pending,
        deferred ({t.deferred}), unknown ({t.unknown}) and accepted-but-unreported messages are left out of both sides until they settle.
        Neither number says the email was opened. Quota counts are our own reservations, so they are estimates.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartContainer
          title={g === "hour" ? "Emails by hour" : "Emails by day"}
          subtitle="Delivered vs accepted-not-yet-confirmed vs failed"
          csv={{ filename: "email-volume", rows: data.series.map((s) => ({ ...s })) }}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={compact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="delivered" name="Delivered" stackId="a" fill={BRAND} />
                <Bar dataKey="other" name="Accepted, unconfirmed" stackId="a" fill={PALETTE[0]} />
                <Bar dataKey="failed" name="Failed / bounced" stackId="a" fill={PALETTE[4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        <ChartContainer title="Fallback frequency" subtitle="Accepted by a backup provider" csv={{ filename: "email-fallback", rows: data.series.map((s) => ({ t: s.t, fallback: s.fallback, accepted: s.accepted })) }}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Bar dataKey="fallback" name="Via backup" fill={PALETTE[2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        <ChartContainer title="Provider usage" subtitle="Messages accepted, by provider" csv={{ filename: "email-providers", rows: data.byProvider.map((p) => ({ ...p })) }}>
          <ul className="space-y-3">
            {data.byProvider.map((p, i) => {
              const max = Math.max(1, ...data.byProvider.map((x) => x.accepted));
              return (
                <li key={p.provider}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-fg">{PROVIDER_LABEL[p.provider]}</span>
                    <span className="text-fg-muted tabular-nums">{p.accepted.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.accepted / max) * 100}%`, background: PALETTE[i] }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </ChartContainer>

        <ChartContainer title="Codes vs other email" subtitle="Critical = sign-in/sign-up codes, password resets, email confirmation">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-xs text-fg-subtle">Critical (codes & resets)</p>
              <p className="text-2xl font-extrabold text-fg">{otp.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-xs text-fg-subtle">Notifications</p>
              <p className="text-2xl font-extrabold text-fg">{other.toLocaleString()}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            {data.byTemplate.map((tpl) => (
              <li key={tpl.templateId} className="flex justify-between gap-3">
                <code className="text-fg-muted truncate">{tpl.templateId}</code>
                <span className="text-fg tabular-nums">{tpl.count.toLocaleString()}</span>
              </li>
            ))}
            {data.byTemplate.length === 0 && <li className="text-fg-subtle">No email in this range.</li>}
          </ul>
        </ChartContainer>
      </div>
    </div>
  );
}
