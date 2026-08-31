"use client";

// Growth analytics: signup cohorts with activation/paid conversion, coupon
// impact, and the affiliate funnel — the slices the executive dashboard
// doesn't carry. Every table exports to CSV client-side.

import { useQuery } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { TypeBars } from "@/app/components/charts";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

interface Growth {
  cohorts: Array<{ month: string; signups: number; activated: number; paid: number }>;
  coupons: {
    top: Array<{ code: string; timesRedeemed: number; discountType: string; discountValue: number; active: boolean }>;
    totalDiscountInPaise: number;
  };
  affiliates: {
    count: number;
    referrals: Record<string, number>;
    conversionPct: number | null;
  };
}

function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null>>) {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminAnalyticsPage() {
  const { token } = useAuth();

  const { data: g, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-growth-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/metrics?section=growth", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load analytics");
      return ((await res.json()).data) as Growth;
    },
    enabled: !!token,
  });

  if (isError) {
    return <AdminShell title="Analytics"><ErrorCard onRetry={refetch} /></AdminShell>;
  }
  if (isLoading || !g) {
    return (
      <AdminShell title="Analytics">
        <div className="animate-pulse space-y-4"><div className="h-48 bg-gray-100 rounded-2xl" /><div className="h-48 bg-gray-100 rounded-2xl" /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Analytics">
      {/* Cohorts */}
      <Card shadow padding="lg">
        <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
          <h2 className="text-base font-bold text-gray-800">Signup cohorts — last 6 months</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv("cohorts.csv", ["month", "signups", "activated", "paid"], g.cohorts.map((c) => [c.month, c.signups, c.activated, c.paid]))}
          >
            Export CSV
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Activation = made ≥1 generation (lifetime). Paid = made ≥1 purchase (lifetime).</p>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
              <th className="font-semibold pb-2">Cohort</th>
              <th className="font-semibold pb-2 text-right">Signups</th>
              <th className="font-semibold pb-2 text-right">Activated</th>
              <th className="font-semibold pb-2 text-right">Activation %</th>
              <th className="font-semibold pb-2 text-right">Paid</th>
              <th className="font-semibold pb-2 text-right">Paid %</th>
            </tr>
          </thead>
          <tbody>
            {g.cohorts.map((c) => (
              <tr key={c.month} className="border-t border-gray-50">
                <td className="py-2 font-semibold text-gray-800">{c.month}</td>
                <td className="py-2 text-right text-gray-700">{c.signups}</td>
                <td className="py-2 text-right text-gray-700">{c.activated}</td>
                <td className="py-2 text-right text-gray-500">{c.signups > 0 ? `${((c.activated / c.signups) * 100).toFixed(0)}%` : "—"}</td>
                <td className="py-2 text-right text-gray-700">{c.paid}</td>
                <td className="py-2 text-right text-gray-500">{c.signups > 0 ? `${((c.paid / c.signups) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
            {g.cohorts.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400 text-sm">No signups in the window.</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Coupons */}
        <Card shadow padding="lg">
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <h2 className="text-base font-bold text-gray-800">Coupon impact</h2>
            <span className="text-xs text-gray-400">₹{Math.round(g.coupons.totalDiscountInPaise / 100).toLocaleString("en-IN")} total discount given</span>
          </div>
          {g.coupons.top.length === 0 ? (
            <p className="text-sm text-gray-400">No redemptions yet.</p>
          ) : (
            <TypeBars items={g.coupons.top.map((c) => ({ type: `${c.code}${c.active ? "" : " (inactive)"}`, count: c.timesRedeemed, avgEngagementRate: null }))} />
          )}
        </Card>

        {/* Affiliate funnel */}
        <Card shadow padding="lg">
          <h2 className="text-base font-bold text-gray-800 mb-3">Affiliate funnel</h2>
          <div className="grid grid-cols-2 gap-3 text-center mb-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xl font-extrabold text-gray-900">{g.affiliates.count}</p>
              <p className="text-xs text-gray-400">Affiliates</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xl font-extrabold text-gray-900">{g.affiliates.conversionPct != null ? `${g.affiliates.conversionPct.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-gray-400">Referral → paid conversion</p>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            {Object.entries(g.affiliates.referrals).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span className="text-gray-500 capitalize">{status.replace("_", " ")}</span>
                <span className="font-semibold text-gray-800">{count}</span>
              </div>
            ))}
            {Object.keys(g.affiliates.referrals).length === 0 && <p className="text-gray-400 text-sm">No referrals yet.</p>}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
