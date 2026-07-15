"use client";
import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  monthlyCredits: number;
  subscriptionEndsAt: string | null;
  nextRefillAt: string | null;
  plan: { id: string; name: string; slug: string } | null;
  _count: { purchases: number };
}

function daysLeft(iso: string | null): number {
  if (!iso) return -1;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminSubscriptionsPage() {
  const { token, user } = useAuth();
  const [subs, setSubs]     = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [extendMonths, setExtendMonths] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const res = await fetch(`/api/admin/subscriptions?page=${page}&limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { subscribers: [], total: 0 };
    setSubs(data.subscribers ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [token, user?.role, page, limit]);

  useEffect(() => { load(); }, [load]);

  async function manualRefill(userId: string) {
    setActingId(userId);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/subscriptions/refill", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubs(prev => prev.map(s => s.id === userId ? { ...s, credits: s.credits + d.creditsAdded } : s));
      } else {
        // e.g. 409 when the refill isn't due yet (idempotency guard)
        setNotice(d.error ?? "Refill failed");
      }
    } finally {
      setActingId(null);
    }
  }

  async function adjustSub(userId: string, opts: { months?: number; expire?: boolean }) {
    setActingId(userId);
    try {
      const res = await fetch("/api/admin/subscriptions/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, ...opts }),
      });
      if (res.ok) await load();
    } finally {
      setActingId(null);
    }
  }

  return (
    <AdminShell title="Subscriptions">
      <div className="flex items-center justify-between mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
          <p className="text-3xl font-extrabold text-gray-900">{total}</p>
          <p className="text-xs text-gray-400 mt-0.5">Active Subscribers</p>
        </div>
      </div>

      {notice && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 mb-4">{notice}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading subscriptions…</p>
      ) : subs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm font-semibold text-gray-600">No active subscribers</p>
          <p className="text-xs text-gray-400 mt-1">Users with active subscriptions will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="py-3.5 px-5">User</th>
                  <th className="py-3.5 px-3">Plan</th>
                  <th className="py-3.5 px-3">Expires</th>
                  <th className="py-3.5 px-3">Days Left</th>
                  <th className="py-3.5 px-3">Mo. Credits</th>
                  <th className="py-3.5 px-3">Next Refill</th>
                  <th className="py-3.5 px-3">Balance</th>
                  <th className="py-3.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => {
                  const days = daysLeft(s.subscriptionEndsAt);
                  const expiring = days >= 0 && days <= 3;
                  const busy = actingId === s.id;
                  const months = parseInt(extendMonths[s.id] ?? "1", 10) || 1;
                  return (
                    <tr key={s.id} className={`border-b border-gray-50 last:border-0 ${expiring ? "bg-yellow-50/40" : ""}`}>
                      <td className="py-3 px-5">
                        <p className="font-semibold text-gray-900">{s.name || s.email}</p>
                        {s.name && <p className="text-xs text-gray-400">{s.email}</p>}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-600">{s.plan?.name ?? "—"}</td>
                      <td className="py-3 px-3 text-xs text-gray-600">{fmt(s.subscriptionEndsAt)}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs font-bold ${expiring ? "text-yellow-600" : "text-gray-600"}`}>
                          {days < 0 ? "expired" : `${days}d`}
                          {expiring && " ⚠️"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{s.monthlyCredits}</td>
                      <td className="py-3 px-3 text-xs text-gray-400">{fmt(s.nextRefillAt)}</td>
                      <td className="py-3 px-3 font-semibold text-gray-900">{s.credits} cr</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => manualRefill(s.id)}
                            disabled={busy}
                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-3 py-1.5 rounded-lg transition-colors">
                            {busy ? "…" : `+${s.monthlyCredits} Refill`}
                          </button>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              min={1} max={24}
                              value={extendMonths[s.id] ?? "1"}
                              onChange={e => setExtendMonths(prev => ({ ...prev, [s.id]: e.target.value }))}
                              className="w-12 bg-gray-50 border border-gray-200 rounded-md text-xs px-1.5 py-1 text-center focus:outline-none"
                            />
                            <button
                              onClick={() => adjustSub(s.id, { months })}
                              disabled={busy}
                              className="text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                              +{months}mo
                            </button>
                          </div>
                          <button
                            onClick={() => adjustSub(s.id, { expire: true })}
                            disabled={busy}
                            className="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors">
                            Expire Now
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 text-xs text-gray-500">
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / limit))} · {total} subscribers
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-lg border border-gray-200 font-semibold disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-3 py-1 rounded-lg border border-gray-200 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
