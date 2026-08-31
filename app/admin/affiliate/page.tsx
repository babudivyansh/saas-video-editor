"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "@/app/admin/AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";

interface AffiliateRow {
  id: string;
  code: string;
  status: string;
  commissionRate: number;
  totalEarned: number;
  totalPaid: number;
  user: { name: string | null; email: string };
  referralCount: number;
  convertedReferrals: number;
  commissionTotals: { pending: number; available: number; paid: number; rejected: number; count: number };
  payoutRequestedAt: string | null;
}

interface CommissionRow {
  id: string;
  status: string;
  baseAmount: number;
  commissionRate: number;
  amount: number;
  createdAt: string;
  availableAt: string;
  paidAt: string | null;
  payoutRef: string | null;
  affiliate: { code: string; user: { name: string | null; email: string } };
  referral: { referredUser: { name: string | null; email: string } };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  suspended: "bg-yellow-100 text-yellow-700",
  banned: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  available: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  signed_up: "bg-gray-100 text-gray-600",
  converted: "bg-green-100 text-green-700",
  flagged: "bg-orange-100 text-orange-700",
};

const PAGE_LIMIT = 100;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}


function AffiliateContent() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"affiliates" | "commissions" | "payouts">("affiliates");
  const [statusFilter, setStatusFilter] = useState("all");
  const [affiliateStatusFilter, setAffiliateStatusFilter] = useState("all");
  const [affiliateSearchInput, setAffiliateSearchInput] = useState("");
  const affiliateSearch = useDebouncedValue(affiliateSearchInput);
  const [payoutRef, setPayoutRef] = useState<Record<string, string>>({});
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState("");
  const [banReasonText, setBanReasonText] = useState("");

  const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const affiliatesQuery = useInfiniteQuery({
    queryKey: ["admin-affiliates", affiliateStatusFilter, affiliateSearch],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(PAGE_LIMIT) });
      if (affiliateStatusFilter !== "all") params.set("status", affiliateStatusFilter);
      if (affiliateSearch.trim()) params.set("search", affiliateSearch.trim());
      const res = await fetch(`/api/admin/affiliates?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load affiliates");
      return (await res.json()) as { affiliates: AffiliateRow[]; total: number };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.affiliates.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    enabled: !!token,
  });
  const affiliates = affiliatesQuery.data?.pages.flatMap((p) => p.affiliates) ?? [];
  const affiliateTotal = affiliatesQuery.data?.pages[0]?.total ?? 0;

  const commissionsQuery = useInfiniteQuery({
    queryKey: ["admin-commissions-list"],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`/api/admin/commissions?page=${pageParam}&limit=${PAGE_LIMIT}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load commissions");
      return (await res.json()) as { commissions: CommissionRow[]; total: number };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.commissions.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    enabled: !!token,
  });
  const commissions = commissionsQuery.data?.pages.flatMap((p) => p.commissions) ?? [];
  const commissionTotal = commissionsQuery.data?.pages[0]?.total ?? 0;

  const loading = affiliatesQuery.isLoading || commissionsQuery.isLoading;

  const sweepMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/commissions/run-payout-sweep", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sweep failed");
      return data as { notified: number; errors?: number };
    },
    onSuccess: (data) => {
      showToast(`Swept ${data.notified} commission(s) to available${data.errors ? `, ${data.errors} error(s)` : ""}.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin-commissions-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  // Surfaces the new structured validation errors instead of silently
  // applying an optimistic update the server may have rejected.
  const updateAffiliateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => {
      const res = await fetch(`/api/admin/affiliates/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(data) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.issues?.[0] ? `${d.issues[0].path}: ${d.issues[0].message}` : d.error ?? "Update failed");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const commissionActionMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: "release" | "reject"; reason?: string }) => {
      const res = await fetch(`/api/admin/commissions/${id}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(reason ? { action, reason } : { action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-commissions-list"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (affiliateId: string) => {
      const ref = payoutRef[affiliateId]?.trim();
      if (!ref) throw new Error("Enter a payout reference (UPI/Wise txn ID)");
      const res = await fetch(`/api/admin/payouts/${affiliateId}`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ payoutRef: ref }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Error");
      return data as { amount: number; commissions: number };
    },
    onSuccess: (data) => {
      showToast(`Paid ₹${data.amount?.toFixed(2)} across ${data.commissions} commissions.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin-commissions-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const filteredCommissions = statusFilter === "all" ? commissions : commissions.filter((c) => c.status === statusFilter);

  const payoutCandidates = [...affiliates]
    .filter((a) => a.commissionTotals.available >= MIN_PAYOUT_AMOUNT)
    .sort((a, b) => (b.payoutRequestedAt ? 1 : 0) - (a.payoutRequestedAt ? 1 : 0));

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {(["affiliates", "commissions", "payouts"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t}
            {t === "payouts" && payoutCandidates.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{payoutCandidates.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}

      {/* Affiliates tab */}
      {tab === "affiliates" && !loading && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <input
              type="text"
              value={affiliateSearchInput}
              onChange={e => setAffiliateSearchInput(e.target.value)}
              placeholder="Search by code, name, or email…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64"
            />
            {["all", "active", "suspended", "banned"].map(s => (
              <button key={s} onClick={() => setAffiliateStatusFilter(s)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${affiliateStatusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">Affiliate</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Referrals</th>
                <th className="px-4 py-3">Earned</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {affiliates.map(a => {
                const converted = a.convertedReferrals;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{a.user.name ?? "—"}</p>
                      <p className="text-xs text-gray-400">{a.user.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.code}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[a.status] ?? ""}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={(a.commissionRate * 100).toFixed(0)} min={0} max={100}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                        onBlur={e => updateAffiliateMutation.mutate({ id: a.id, data: { commissionRate: parseFloat(e.target.value) / 100 } })} />%
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.referralCount} ({converted} converted)</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">₹{a.totalEarned.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-800">₹{a.totalPaid.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {a.status === "active" && (
                          <button onClick={() => updateAffiliateMutation.mutate({ id: a.id, data: { status: "suspended" } })} className="text-xs text-yellow-600 hover:underline">Suspend</button>
                        )}
                        {a.status === "suspended" && (
                          <button onClick={() => updateAffiliateMutation.mutate({ id: a.id, data: { status: "active" } })} className="text-xs text-green-600 hover:underline">Activate</button>
                        )}
                        {a.status === "banned" && (
                          <button onClick={() => updateAffiliateMutation.mutate({ id: a.id, data: { status: "active" } })} className="text-xs text-green-600 hover:underline">Reinstate</button>
                        )}
                        {a.status !== "banned" && (
                          <button onClick={() => setConfirmBan(a.id)} className="text-xs text-red-500 hover:underline">Ban</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {affiliates.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No affiliates yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
          {affiliates.length < affiliateTotal && (
            <button
              onClick={() => affiliatesQuery.fetchNextPage()}
              disabled={affiliatesQuery.isFetchingNextPage}
              className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border-t border-gray-50 disabled:opacity-50"
            >
              {affiliatesQuery.isFetchingNextPage ? "Loading…" : `Load more (${affiliates.length} of ${affiliateTotal})`}
            </button>
          )}
          </div>
        </>
      )}

      {/* Commissions tab */}
      {tab === "commissions" && !loading && (
        <>
          <div className="flex gap-2 mb-4">
            {["all", "pending", "available", "paid", "rejected"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Affiliate</th>
                  <th className="px-4 py-3">Referred User</th>
                  <th className="px-4 py-3">Base (₹)</th>
                  <th className="px-4 py-3">Commission (₹)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Available At</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCommissions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs text-gray-600">{c.affiliate.code}</p>
                      <p className="text-xs text-gray-400">{c.affiliate.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{c.referral.referredUser.email}</td>
                    <td className="px-4 py-3 text-gray-800">₹{c.baseAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">₹{c.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(c.availableAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      {c.status === "pending" && (
                        <button onClick={() => commissionActionMutation.mutate({ id: c.id, action: "release" })} className="text-xs text-blue-600 hover:underline mr-2">Release</button>
                      )}
                      {(c.status === "pending" || c.status === "available") && (
                        <button onClick={() => setConfirmReject(c.id)} className="text-xs text-red-500 hover:underline">Reject</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCommissions.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No commissions found</td></tr>
                )}
              </tbody>
            </table>
            </div>
            {commissions.length < commissionTotal && (
              <button
                onClick={() => commissionsQuery.fetchNextPage()}
                disabled={commissionsQuery.isFetchingNextPage}
                className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border-t border-gray-50 disabled:opacity-50"
              >
                {commissionsQuery.isFetchingNextPage ? "Loading…" : `Load more (${commissions.length} of ${commissionTotal})`}
              </button>
            )}
          </div>
        </>
      )}

      {/* Payouts tab */}
      {tab === "payouts" && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => sweepMutation.mutate()}
              disabled={sweepMutation.isPending}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all"
            >
              {sweepMutation.isPending ? "Running…" : "Run payout sweep now"}
            </button>
            <span className="text-xs text-gray-400">
              Flips pending commissions past their 30-day hold to available &amp; emails affiliates. Same sweep the daily cron runs.
            </span>
          </div>
          {payoutCandidates.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 shadow-sm">
              No affiliates have ₹{MIN_PAYOUT_AMOUNT}+ available for payout
            </div>
          )}
          {payoutCandidates.map(a => {
            const avail = a.commissionTotals.available;
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {a.user.name ?? "—"}
                      {a.payoutRequestedAt && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          Requested {timeAgo(a.payoutRequestedAt)}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{a.user.email} · <span className="font-mono">{a.code}</span></p>
                    <p className="text-lg font-bold text-green-600 mt-1">₹{avail.toFixed(2)} available</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="UPI / Wise txn ID"
                      value={payoutRef[a.id] ?? ""}
                      onChange={e => setPayoutRef(p => ({ ...p, [a.id]: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48" />
                    <button onClick={() => markPaidMutation.mutate(a.id)}
                      disabled={markPaidMutation.isPending && markPaidMutation.variables === a.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all">
                      Mark Paid
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmBan}
        title="Ban affiliate"
        message={(() => {
          const target = affiliates.find((a) => a.id === confirmBan);
          return `Ban ${target?.user.name ?? target?.user.email ?? "this affiliate"}? They'll be unable to earn further commissions.`;
        })()}
        confirmLabel="Ban"
        danger
        onConfirm={async () => {
          if (!confirmBan) return;
          const reason = banReasonText.trim() || undefined;
          await updateAffiliateMutation.mutateAsync({ id: confirmBan, data: reason ? { status: "banned", reason } : { status: "banned" } });
          setBanReasonText("");
        }}
        onClose={() => { setConfirmBan(null); setBanReasonText(""); }}
      >
        <input
          type="text"
          placeholder="Reason (optional)"
          value={banReasonText}
          onChange={(e) => setBanReasonText(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!confirmReject}
        title="Reject commission"
        message={(() => {
          const target = commissions.find((c) => c.id === confirmReject);
          return target ? `Reject the ₹${target.amount.toFixed(2)} commission for ${target.affiliate.user.email}?` : "";
        })()}
        confirmLabel="Reject"
        danger
        onConfirm={async () => {
          if (!confirmReject) return;
          const reason = rejectReasonText.trim() || undefined;
          await commissionActionMutation.mutateAsync({ id: confirmReject, action: "reject", reason });
          setRejectReasonText("");
        }}
        onClose={() => { setConfirmReject(null); setRejectReasonText(""); }}
      >
        <input
          type="text"
          placeholder="Reason (optional)"
          value={rejectReasonText}
          onChange={(e) => setRejectReasonText(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </ConfirmDialog>
    </>
  );
}

export default function AdminAffiliatePage() {
  return (
    <AdminShell title="Affiliates">
      <AffiliateContent />
    </AdminShell>
  );
}
