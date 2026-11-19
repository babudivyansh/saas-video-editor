"use client";

// Admin → Analytics: activation funnel, retention by signup week, and where
// AutoClip and AI tools fail (GET /api/admin/funnel → lib/admin/funnel.ts).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { ErrorCard } from "../../dashboard/ui";

type Range = 7 | 30 | 90;

interface FunnelReport {
  days: Range;
  steps: Array<{ key: string; label: string; users: number; note?: string }>;
  medianHoursToFirstRun: number | null;
  retention: Array<{ week: string; signups: number; d1: number | null; d7: number | null; d30: number | null }>;
  autoClipFailures: Array<{ reason: string; count: number }>;
  toolFailures: Array<{ label: string; total: number; failed: number; topReason: string | null }>;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "—");

function duration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Steps the Users list can filter to (lib/admin/user-filters.ts), scoped to the same signup window. */
const STEP_JOURNEY: Record<string, string> = {
  signed_up: "",
  ran_autoclip: "journey=ran&",
  paid: "journey=paid&",
};

export function FunnelPanel({ token }: { token: string | null }) {
  const [days, setDays] = useState<Range>(30);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-funnel", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/funnel?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load funnel");
      return (await res.json()) as FunnelReport;
    },
    enabled: !!token,
  });

  const header = (
    <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
      <h2 className="text-base font-bold text-fg">Activation funnel</h2>
      <div role="group" aria-label="Signup window" className="flex gap-1">
        {([7, 30, 90] as const).map((d) => (
          <Button key={d} size="sm" variant={d === days ? "primary" : "secondary"} aria-pressed={d === days} onClick={() => setDays(d)}>
            {d} days
          </Button>
        ))}
      </div>
    </div>
  );

  if (isError) return <Card shadow padding="lg">{header}<ErrorCard onRetry={refetch} /></Card>;
  if (isLoading || !data) {
    return <Card shadow padding="lg">{header}<div className="h-72 bg-surface-3 rounded-2xl animate-pulse mt-3" /></Card>;
  }

  const signups = data.steps[0]?.users ?? 0;
  const ran = data.steps.find((s) => s.key === "ran_autoclip")?.users ?? 0;

  return (
    <div className="space-y-5 mb-5">
      <Card shadow padding="lg">
        {header}
        <p className="text-xs text-fg-subtle mb-4">
          People who signed up in the last {data.days} days, and how far each got (ever). Median time from signup to first AutoClip run:{" "}
          <span className="font-semibold text-fg">{duration(data.medianHoursToFirstRun)}</span>.
        </p>
        <ol className="space-y-2.5">
          {data.steps.map((s, i) => {
            const prev = i > 0 ? data.steps[i - 1].users : s.users;
            const width = signups > 0 ? Math.max(2, (s.users / signups) * 100) : 0;
            const journey = STEP_JOURNEY[s.key];
            const link = journey === undefined ? undefined : `${journey}joined=${data.days}d`;
            return (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                  <span className="text-fg">
                    {s.label}
                    {s.note && <span className="text-[11px] text-fg-subtle ml-2">{s.note}</span>}
                  </span>
                  <span className="text-fg-muted whitespace-nowrap tabular-nums">
                    {link !== undefined ? (
                      <Link href={`/admin/users?${link}`} className="font-semibold text-fg hover:underline">{s.users}</Link>
                    ) : (
                      <span className="font-semibold text-fg">{s.users}</span>
                    )}
                    <span className="ml-2">{pct(s.users, signups)}</span>
                    {i > 0 && <span className="ml-2 text-[11px] text-fg-subtle">{pct(s.users, prev)} of previous</span>}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        {signups - ran > 0 && (
          <p className="text-xs text-fg-subtle mt-4">
            {signups - ran} of {signups} never started AutoClip.{" "}
            <Link href={`/admin/users?journey=never_ran&joined=${data.days}d`} className="text-brand hover:underline">See who</Link>
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card shadow padding="lg">
          <h2 className="text-base font-bold text-fg mb-1">Retention by signup week</h2>
          <p className="text-xs text-fg-subtle mb-3">
            Share of each week&apos;s signups seen again (login, upload, AutoClip run or AI tool) 1, 7 and 30+ days after signing up. Blank until the week is old enough.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                  <th className="font-semibold pb-2">Week of</th>
                  <th className="font-semibold pb-2 text-right">Signups</th>
                  <th className="font-semibold pb-2 text-right">Day 1+</th>
                  <th className="font-semibold pb-2 text-right">Day 7+</th>
                  <th className="font-semibold pb-2 text-right">Day 30+</th>
                </tr>
              </thead>
              <tbody>
                {data.retention.map((r) => (
                  <tr key={r.week} className="border-t border-line">
                    <td className="py-1.5 text-fg whitespace-nowrap">{new Date(r.week).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td className="py-1.5 text-right text-fg tabular-nums">{r.signups}</td>
                    {[r.d1, r.d7, r.d30].map((v, i) => (
                      <td key={i} className="py-1.5 text-right text-fg-muted tabular-nums">{v == null ? "" : `${v}%`}</td>
                    ))}
                  </tr>
                ))}
                {data.retention.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-fg-subtle">No signups in the last 12 weeks.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card shadow padding="lg">
          <h2 className="text-base font-bold text-fg mb-1">Where things fail · last {data.days} days</h2>
          <h3 className="text-xs font-semibold text-fg-muted mt-3 mb-1.5">AutoClip runs</h3>
          {data.autoClipFailures.length === 0 ? (
            <p className="text-sm text-fg-subtle">No failed runs.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.autoClipFailures.map((f) => (
                <li key={f.reason} className="flex justify-between gap-3">
                  <span className="text-fg-muted break-words">{f.reason}</span>
                  <span className="font-semibold text-error tabular-nums">{f.count}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-xs font-semibold text-fg-muted mt-4 mb-1.5">AI tools (tool · model)</h3>
          {data.toolFailures.length === 0 ? (
            <p className="text-sm text-fg-subtle">No failed tool runs.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.toolFailures.map((t) => (
                <li key={t.label}>
                  <div className="flex justify-between gap-3">
                    <span className="text-fg break-words">{t.label}</span>
                    <span className="tabular-nums text-fg-muted whitespace-nowrap">
                      <span className="font-semibold text-error">{t.failed}</span> / {t.total} ({pct(t.failed, t.total)})
                    </span>
                  </div>
                  {t.topReason && <p className="text-[11px] text-fg-subtle break-words">{t.topReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
