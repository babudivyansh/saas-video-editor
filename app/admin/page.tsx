"use client";
import { useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Stats {
  users: number;
  videosRendered: number;
  rendering: number;
  activePlans: number;
  creditsOutstanding: number;
  revenueInPaise: number;
  purchaseCount: number;
}

export default function AdminDashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => setStats(data?.stats ?? null))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const cards = [
    { label: "Total Users",        value: stats?.users ?? "—" },
    { label: "Videos Rendered",    value: stats?.videosRendered ?? "—" },
    { label: "Currently Rendering",value: stats?.rendering ?? "—" },
    { label: "Active Plans",       value: stats?.activePlans ?? "—" },
    { label: "Credits Outstanding",value: stats?.creditsOutstanding ?? "—" },
    { label: "Total Purchases",    value: stats?.purchaseCount ?? "—" },
    { label: "Total Revenue",      value: stats ? `₹${Math.round(stats.revenueInPaise / 100).toLocaleString("en-IN")}` : "—" },
  ];

  return (
    <AdminShell title="Dashboard">
      {loading ? (
        <p className="text-sm text-gray-400">Loading stats…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {cards.map(c => (
            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-3xl font-extrabold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
