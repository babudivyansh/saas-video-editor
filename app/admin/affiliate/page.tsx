"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "@/app/admin/AdminShell";
import { useAuth } from "@/app/components/AuthContext";
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
  const [tab, setTab] = useState<"affiliates" | "commissions" | "payouts">("affiliates");
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [affiliateTotal, setAffiliateTotal] = useState(0);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [affiliateStatusFilter, setAffiliateStatusFilter] = useState("all");
  const [affiliateSearch, setAffiliateSearch] = useState("");
  const [payoutRef, setPayoutRef] = useState<Record<string, string>>({});
  const [payoutMsg, setPayoutMsg] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [banReason, setBanReason] = useState<Record<string, string>>({});
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token],
  );

  const loadAffiliates = useCallback(async (page: number, append: boolean, status: string, search: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const d = await fetch(`/api/admin/affiliates?${params}`, { headers: authHeaders() }).then(r => r.json());
    setAffiliates(prev => (append ? [...prev, ...(d.affiliates ?? [])] : d.affiliates ?? []));
    setAffiliateTotal(d.total ?? 0);
  }, [authHeaders]);

  const loadCommissions = useCallback(async (page: number, append: boolean) => {
    const d = await fetch(`/api/admin/commissions?page=${page}&limit=${PAGE_LIMIT}`, { headers: authHeaders() }).then(r => r.json());
    setCommissions(prev => (append ? [...prev, ...(d.commissions ?? [])] : d.commissions ?? []));
    setCommissionTotal(d.total ?? 0);
  }, [authHeaders]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([loadAffiliates(1, false, "all", ""), loadCommissions(1, false)]).finally(() => setLoading(false));
  }, [token, loadAffiliates, loadCommissions]);

  // Status-filter clicks reload instantly; free-text search debounces so
  // typing doesn't fire a request per keystroke (same pattern as
  // app/admin/users/page.tsx's search box).
  const affiliateSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onAffiliateStatusFilter(status: string) {
    setAffiliateStatusFilter(status);
    loadAffiliates(1, false, status, affiliateSearch);
  }

  function onAffiliateSearch(search: string) {
    setAffiliateSearch(search);
    if (affiliateSearchDebounce.current) clearTimeout(affiliateSearchDebounce.current);
    affiliateSearchDebounce.current = setTimeout(() => loadAffiliates(1, false, affiliateStatusFilter, search), 400);
  }

  async function runPayoutSweep() {
    setSweeping(true);
    setSweepMsg(null);
    try {
      const res = await fetch("/api/admin/commissions/run-payout-sweep", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setSweepMsg(`Swept ${data.notified} commission(s) to available${data.errors ? `, ${data.errors} error(s)` : ""}.`);
        loadCommissions(1, false);
        loadAffiliates(1, false, affiliateStatusFilter, affiliateSearch);
      } else {
        setSweepMsg(data.error ?? "Sweep failed");
      }
    } finally {
      setSweeping(false);
    }
  }

  // Surfaces the new structured validation errors instead of silently
  // applying an optimistic update the server may have rejected.
  async function updateAffiliate(id: string, data: object) {
    const res = await fetch(`/api/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setActionMsg(null);
      setAffiliates(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
    } else {
      const d = await res.json().catch(() => ({}));
      setActionMsg(d.issues?.[0] ? `${d.issues[0].path}: ${d.issues[0].message}` : d.error ?? "Update failed");
    }
  }

  async function commissionAction(id: string, action: "release" | "reject", reason?: string) {
    const res = await fetch(`/api/admin/commissions/${id}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(reason ? { action, reason } : { action }),
    });
    const data = await res.json();
    if (res.ok) {
      setActionMsg(null);
      setCommissions(prev => prev.map(c => c.id === id ? { ...c, status: data.commission?.status ?? c.status } : c));
    } else {
      setActionMsg(data.error ?? "Action failed");
    }
    setConfirmReject(null);
    setRejectReason(r => ({ ...r, [id]: "" }));
  }

  async function banAffiliate(id: string, reason?: string) {
    await updateAffiliate(id, reason ? { status: "banned", reason } : { status: "banned" });
    setConfirmBan(null);
    setBanReason(r => ({ ...r, [id]: "" }));
  }

  async function markPaid(affiliateId: string) {
    const ref = payoutRef[affiliateId]?.trim();
    if (!ref) { setPayoutMsg(m => ({ ...m, [affiliateId]: "Enter a payout reference (UPI/Wise txn ID)" })); return; }
    const res = await fetch(`/api/admin/payouts/${affiliateId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ payoutRef: ref }),
    });
    const data = await res.json();
    if (data.success) {
      setPayoutMsg(m => ({ ...m, [affiliateId]: `Paid ₹${data.amount?.toFixed(2)} across ${data.commissions} commissions.` }));
      loadCommissions(1, false);
      loadAffiliates(1, false, affiliateStatusFilter, affiliateSearch);
    } else {
      setPayoutMsg(m => ({ ...m, [affiliateId]: data.error ?? "Error" }));
    }
  }

  const filteredCommissions = statusFilter === "all" ? commissions : commissions.filter(c => c.status === statusFilter);

  const payoutCandidates = [...affiliates]
    .filter(a => a.commissionTotals.available >= MIN_PAYOUT_AMOUNT)
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
      {actionMsg && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2 mb-4">{actionMsg}</p>
      )}

      {/* Affiliates tab */}
      {tab === "affiliates" && !loading && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <input
              type="text"
              value={affiliateSearch}
              onChange={e => onAffiliateSearch(e.target.value)}
              placeholder="Search by code, name, or email…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64"
            />
            {["all", "active", "suspended", "banned"].map(s => (
              <button key={s} onClick={() => onAffiliateStatusFilter(s)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${affiliateStatusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
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
                        onBlur={e => updateAffiliate(a.id, { commissionRate: parseFloat(e.target.value) / 100 })} />%
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.referralCount} ({converted} converted)</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">₹{a.totalEarned.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-800">₹{a.totalPaid.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {confirmBan === a.id ? (
                        <div className="flex items-center gap-1.5">
                          <input type="text" placeholder="Reason (optional)"
                            value={banReason[a.id] ?? ""}
                            onChange={e => setBanReason(r => ({ ...r, [a.id]: e.target.value }))}
                            className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-28" />
                          <button onClick={() => banAffiliate(a.id, banReason[a.id]?.trim() || undefined)}
                            className="text-xs font-bold text-white bg-red-600 rounded px-2 py-0.5">
                            Confirm ban?
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          {a.status === "active" && (
                            <button onClick={() => updateAffiliate(a.id, { status: "suspended" })} className="text-xs text-yellow-600 hover:underline">Suspend</button>
                          )}
                          {a.status === "suspended" && (
                            <button onClick={() => updateAffiliate(a.id, { status: "active" })} className="text-xs text-green-600 hover:underline">Activate</button>
                          )}
                          {a.status === "banned" && (
                            <button onClick={() => updateAffiliate(a.id, { status: "active" })} className="text-xs text-green-600 hover:underline">Reinstate</button>
                          )}
                          {a.status !== "banned" && (
                            <button onClick={() => setConfirmBan(a.id)} className="text-xs text-red-500 hover:underline">Ban</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {affiliates.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No affiliates yet</td></tr>
              )}
            </tbody>
          </table>
          {affiliates.length < affiliateTotal && (
            <button
              onClick={() => loadAffiliates(Math.floor(affiliates.length / PAGE_LIMIT) + 1, true, affiliateStatusFilter, affiliateSearch)}
              className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border-t border-gray-50"
            >
              Load more ({affiliates.length} of {affiliateTotal})
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
                        <button onClick={() => commissionAction(c.id, "release")} className="text-xs text-blue-600 hover:underline mr-2">Release</button>
                      )}
                      {(c.status === "pending" || c.status === "available") && (
                        confirmReject === c.id ? (
                          <div className="flex items-center gap-1.5">
                            <input type="text" placeholder="Reason (optional)"
                              value={rejectReason[c.id] ?? ""}
                              onChange={e => setRejectReason(r => ({ ...r, [c.id]: e.target.value }))}
                              className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-28" />
                            <button
                              onClick={() => commissionAction(c.id, "reject", rejectReason[c.id]?.trim() || undefined)}
                              className="text-xs font-bold text-white bg-red-600 rounded px-2 py-0.5"
                            >
                              Confirm reject?
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmReject(c.id)} className="text-xs text-red-500 hover:underline">Reject</button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCommissions.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No commissions found</td></tr>
                )}
              </tbody>
            </table>
            {commissions.length < commissionTotal && (
              <button
                onClick={() => loadCommissions(Math.floor(commissions.length / PAGE_LIMIT) + 1, true)}
                className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border-t border-gray-50"
              >
                Load more ({commissions.length} of {commissionTotal})
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
              onClick={runPayoutSweep}
              disabled={sweeping}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all"
            >
              {sweeping ? "Running…" : "Run payout sweep now"}
            </button>
            <span className="text-xs text-gray-400">
              Flips pending commissions past their 30-day hold to available &amp; emails affiliates. Same sweep the daily cron runs.
            </span>
          </div>
          {sweepMsg && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">{sweepMsg}</p>
          )}
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
                    <button onClick={() => markPaid(a.id)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-all">
                      Mark Paid
                    </button>
                  </div>
                </div>
                {payoutMsg[a.id] && (
                  <p className="text-sm mt-3 text-green-700 bg-green-50 rounded-lg px-4 py-2">{payoutMsg[a.id]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
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
