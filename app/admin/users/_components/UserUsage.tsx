"use client";

// Admin → Users → [user] → Usage: what this account consumed, per feature, on
// both meters — credits (AI tools) and Clip Minutes (AutoClip). Net of
// refunds, from the ledgers (GET /api/admin/users/:id/usage).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/app/components/ui/Card";
import { ErrorCard } from "../../dashboard/ui";

interface FeatureUsage {
  feature: string;
  label: string;
  spent: number;
  refunded: number;
  net: number;
  uses: number;
  lastUsedAt: string | null;
}
interface Usage {
  rangeDays: number | null;
  credits: { features: FeatureUsage[]; net: number };
  minutes: { features: FeatureUsage[]; net: number };
}

const RANGES = [
  { id: "7", label: "7d" },
  { id: "30", label: "30d" },
  { id: "90", label: "90d" },
  { id: "all", label: "All time" },
] as const;

const n = (v: number) => v.toLocaleString("en-IN");
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function UserUsage({ userId, headers }: { userId: string; headers: () => HeadersInit }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-user-usage", userId, range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/usage?range=${range}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load usage");
      return (await res.json()) as Usage;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-fg-subtle">
          What this account used, per feature. AutoClip is charged in Clip Minutes; the AI tools in credits. Refunded runs don’t count.
        </p>
        <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                range === r.id ? "bg-panel text-fg shadow-sm" : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
          <div className="h-48 bg-surface-3 rounded-2xl" />
          <div className="h-48 bg-surface-3 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MeterTable title="Clip Minutes" unit="min" total={data.minutes.net} rows={data.minutes.features} />
          <MeterTable title="Credits" unit="cr" total={data.credits.net} rows={data.credits.features} />
        </div>
      )}
    </div>
  );
}

function MeterTable({ title, unit, total, rows }: { title: string; unit: string; total: number; rows: FeatureUsage[] }) {
  const max = Math.max(1, ...rows.map((r) => r.net));
  return (
    <Card shadow padding="md">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-bold text-fg">{title} used</p>
        <p className="text-lg font-extrabold text-fg">
          {n(total)} <span className="text-xs font-semibold text-fg-subtle">{unit}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle py-4">Nothing used in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                <th className="pb-2">Feature</th>
                <th className="pb-2 text-right">Used</th>
                <th className="pb-2 text-right">Runs</th>
                <th className="pb-2 text-right">Refunded</th>
                <th className="pb-2 text-right">Last used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-fg">{r.label}</p>
                    <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full bg-emerald-bright" style={{ width: `${(r.net / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 text-right font-semibold text-fg whitespace-nowrap">{n(r.net)} {unit}</td>
                  <td className="py-2 text-right text-fg-muted">{n(r.uses)}</td>
                  <td className="py-2 text-right text-fg-subtle">{r.refunded > 0 ? `${n(r.refunded)} ${unit}` : "—"}</td>
                  <td className="py-2 text-right text-xs text-fg-subtle whitespace-nowrap">{when(r.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
