"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "@/app/components/ui/Toast";

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

const LIMIT = 50;

export default function AdminSubscriptionsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [extendMonths, setExtendMonths] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-subscriptions", page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/subscriptions?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load subscriptions");
      return res.json() as Promise<{ subscribers: Subscriber[]; total: number }>;
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  const refillMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/subscriptions/refill", {
        method: "POST", headers: headers(), body: JSON.stringify({ userId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Refill failed"); // e.g. 409 — not due yet (idempotency guard)
      return d as { creditsAdded: number };
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }); showToast("Credits refilled", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
    onSettled: () => setActingId(null),
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ userId, opts }: { userId: string; opts: { months?: number; expire?: boolean } }) => {
      const res = await fetch("/api/admin/subscriptions/extend", {
        method: "POST", headers: headers(), body: JSON.stringify({ userId, ...opts }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
    },
    onSuccess: (_d, { opts }) => { queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }); showToast(opts.expire ? "Subscription expired" : "Subscription extended", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
    onSettled: () => setActingId(null),
  });

  const subs = data?.subscribers ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminShell title="Subscriptions">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
          <p className="text-3xl font-extrabold text-gray-900">{total}</p>
          <p className="text-xs text-gray-400 mt-0.5">Active Subscribers</p>
        </div>
        <input
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); setPage(1); }}
          placeholder="Search by email or name…"
          className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading subscriptions…</p>
      ) : subs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm font-semibold text-gray-600">{search ? "No matching subscribers" : "No active subscribers"}</p>
          <p className="text-xs text-gray-400 mt-1">{search ? "Try a different search." : "Users with active subscriptions will appear here."}</p>
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
                            onClick={() => { setActingId(s.id); refillMutation.mutate(s.id); }}
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
                              onClick={() => { setActingId(s.id); adjustMutation.mutate({ userId: s.id, opts: { months } }); }}
                              disabled={busy}
                              className="text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                              +{months}mo
                            </button>
                          </div>
                          <button
                            onClick={() => { setActingId(s.id); adjustMutation.mutate({ userId: s.id, opts: { expire: true } }); }}
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
          {total > LIMIT && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 text-xs text-gray-500">
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / LIMIT))} · {total} subscribers
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
                  disabled={page >= Math.ceil(total / LIMIT)}
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
