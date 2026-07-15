"use client";
import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
  plan: { name: string; slug: string; kind: string } | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const LIMIT = 50;

export default function AdminPurchasesPage() {
  const { token, user } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [plans, setPlans]         = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState("");
  const [planSlug, setPlanSlug]   = useState("");
  const [status, setStatus]       = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), limit: String(LIMIT),
      search, planSlug, status, from, to,
    });
    const [res, pRes] = await Promise.all([
      fetch(`/api/admin/purchases?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const data  = res.ok  ? await res.json()  : { purchases: [], total: 0 };
    const pData = pRes.ok ? await pRes.json() : { plans: [] };
    setPurchases(data.purchases ?? []);
    setTotal(data.total ?? 0);
    setPlans(pData.plans ?? []);
    setLoading(false);
  }, [token, user?.role, page, search, planSlug, status, from, to]);

  useEffect(() => { load(); }, [load]);

  async function refund(purchaseId: string) {
    setRefundBusy(true);
    setRefundMsg(null);
    try {
      const res = await fetch(`/api/admin/purchases/${purchaseId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: refundReason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRefundMsg(`Refund recorded — ${d.creditsClawedBack} credits clawed back. Complete the money refund in the Razorpay dashboard.`);
        setRefundingId(null);
        await load();
      } else {
        setRefundMsg(d.error ?? "Refund failed");
      }
    } finally {
      setRefundBusy(false);
    }
  }

  function doExport() {
    const params = new URLSearchParams({ export: "csv", search, planSlug, status, from, to });
    const url = `/api/admin/purchases?${params}`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `purchases-${Date.now()}.csv`);
    // Auth header can't be set on anchor; use fetch+blob instead
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      });
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const totalRevenue = purchases.reduce((s, p) => s + p.amountInPaise, 0);
  const inputCls = "bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

  return (
    <AdminShell title="Purchases">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          placeholder="Search user email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className={`${inputCls} w-52`}
        />
        <select value={planSlug} onChange={e => { setPlanSlug(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All plans</option>
          {plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All statuses</option>
          <option value="captured">Captured</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className={inputCls} title="From date" />
        <input type="date" value={to}   onChange={e => { setTo(e.target.value);   setPage(1); }} className={inputCls} title="To date" />
        <button onClick={doExport}
          className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="flex gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-2xl font-extrabold text-gray-900">{total}</p>
            <p className="text-xs text-gray-400 mt-0.5">Transactions</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-2xl font-extrabold text-blue-600">₹{Math.round(totalRevenue / 100).toLocaleString("en-IN")}</p>
            <p className="text-xs text-gray-400 mt-0.5">Revenue (this page)</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading purchases…</p>
      ) : purchases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm font-semibold text-gray-600">No purchases found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          {refundMsg && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 mb-4">{refundMsg}</p>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="py-3.5 px-5">User</th>
                    <th className="py-3.5 px-3">Plan</th>
                    <th className="py-3.5 px-3">Kind</th>
                    <th className="py-3.5 px-3">Amount</th>
                    <th className="py-3.5 px-3">Credits</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3">Date</th>
                    <th className="py-3.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 px-5">
                        <p className="font-semibold text-gray-700">{p.user?.name || p.user?.email || "—"}</p>
                        {p.user?.name && <p className="text-xs text-gray-400">{p.user.email}</p>}
                      </td>
                      <td className="py-3 px-3 text-gray-600 text-xs">{p.plan?.name ?? "—"}</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          p.plan?.kind === "subscription" ? "bg-blue-100 text-blue-700" :
                          p.plan?.kind === "addon"        ? "bg-purple-100 text-purple-700" :
                          "bg-gray-100 text-gray-600"}`}>
                          {p.plan?.kind ?? "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-900">₹{Math.round(p.amountInPaise / 100).toLocaleString("en-IN")}</td>
                      <td className="py-3 px-3 text-gray-600">+{p.credits}</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                          p.status === "captured" ? "text-green-700 bg-green-100" :
                          p.status === "failed"   ? "text-red-700 bg-red-100" :
                          "text-gray-600 bg-gray-100"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(p.createdAt)}</td>
                      <td className="py-3 px-3">
                        {p.status !== "refunded" && (
                          refundingId === p.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={refundReason}
                                onChange={e => setRefundReason(e.target.value)}
                                placeholder="Reason (required)"
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-36"
                              />
                              <button
                                onClick={() => refund(p.id)}
                                disabled={refundReason.trim().length < 3 || refundBusy}
                                className="text-xs font-bold text-white bg-red-600 rounded-lg px-2 py-1 disabled:opacity-50">
                                {refundBusy ? "…" : "Refund"}
                              </button>
                              <button onClick={() => setRefundingId(null)} className="text-xs text-gray-400">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setRefundingId(p.id); setRefundReason(""); }}
                              className="text-xs font-semibold text-red-600 hover:underline">
                              Refund
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
