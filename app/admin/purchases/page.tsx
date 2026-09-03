"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

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
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [planSlug, setPlanSlug] = useState("");
  const [status, setStatus]     = useState("");
  const [from, setFrom]         = useState("");
  const [to, setTo]             = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const filterParams = { page: String(page), limit: String(LIMIT), search, planSlug, status, from, to };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-purchases", filterParams],
    queryFn: async () => {
      const [res, pRes] = await Promise.all([
        fetch(`/api/admin/purchases?${new URLSearchParams(filterParams)}`, { headers: headers() }),
        fetch("/api/admin/plans", { headers: headers() }),
      ]);
      if (!res.ok) throw new Error("Failed to load purchases");
      const data = (await res.json()) as { purchases?: Purchase[]; total?: number };
      const pData = pRes.ok ? ((await pRes.json()) as { plans?: { slug: string; name: string }[] }) : { plans: [] };
      return { purchases: data.purchases ?? [], total: data.total ?? 0, plans: pData.plans ?? [] };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  const refundMutation = useMutation({
    mutationFn: async ({ purchaseId, reason }: { purchaseId: string; reason: string }) => {
      const res = await fetch(`/api/admin/purchases/${purchaseId}/refund`, {
        method: "POST", headers: headers(), body: JSON.stringify({ reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Refund failed");
      return d as { creditsClawedBack: number };
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["admin-purchases"] });
      showToast(`Refund recorded — ${d.creditsClawedBack} credits clawed back. Complete the money refund in the Razorpay dashboard.`, "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  function doExport() {
    const params = new URLSearchParams({ export: "csv", search, planSlug, status, from, to });
    const url = `/api/admin/purchases?${params}`;
    // Auth header can't be set on anchor; use fetch+blob instead
    fetch(url, { headers: headers() })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.setAttribute("download", `purchases-${Date.now()}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      });
  }

  const purchases = data?.purchases ?? [];
  const total = data?.total ?? 0;
  const plans = data?.plans ?? [];
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const totalRevenue = purchases.reduce((s, p) => s + p.amountInPaise, 0);
  const inputCls = "bg-panel border border-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm";

  return (
    <AdminShell title="Purchases">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          placeholder="Search user email…"
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); setPage(1); }}
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
        <Button variant="secondary" onClick={doExport}>
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {!isLoading && !isError && (
        <div className="flex gap-4 mb-5">
          <Card shadow padding="md">
            <p className="text-2xl font-extrabold text-fg">{total}</p>
            <p className="text-xs text-fg-subtle mt-0.5">Transactions</p>
          </Card>
          <Card shadow padding="md">
            <p className="text-2xl font-extrabold text-brand">₹{Math.round(totalRevenue / 100).toLocaleString("en-IN")}</p>
            <p className="text-xs text-fg-subtle mt-0.5">Revenue (this page)</p>
          </Card>
        </div>
      )}

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading purchases…</p>
      ) : purchases.length === 0 ? (
        <Card shadow className="p-12 text-center">
          <p className="text-sm font-semibold text-fg-muted">No purchases found</p>
          <p className="text-xs text-fg-subtle mt-1">Try adjusting your filters.</p>
        </Card>
      ) : (
        <>
          <Card shadow className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
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
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="py-3 px-5">
                        <p className="font-semibold text-fg">{p.user?.name || p.user?.email || "—"}</p>
                        {p.user?.name && <p className="text-xs text-fg-subtle">{p.user.email}</p>}
                      </td>
                      <td className="py-3 px-3 text-fg-muted text-xs">{p.plan?.name ?? "—"}</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          p.plan?.kind === "subscription" ? "bg-tint-violet text-brand" :
                          p.plan?.kind === "addon"        ? "bg-purple-100 text-purple-700" :
                          "bg-surface-3 text-fg-muted"}`}>
                          {p.plan?.kind ?? "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-fg">₹{Math.round(p.amountInPaise / 100).toLocaleString("en-IN")}</td>
                      <td className="py-3 px-3 text-fg-muted">+{p.credits}</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                          p.status === "captured" ? "text-green-700 bg-green-100" :
                          p.status === "failed"   ? "text-red-700 bg-red-100" :
                          "text-fg-muted bg-surface-3"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-fg-subtle text-xs whitespace-nowrap">{fmt(p.createdAt)}</td>
                      <td className="py-3 px-3">
                        {p.status !== "refunded" && (
                          <Button
                            variant="link"
                            onClick={() => { setRefundingId(p.id); setRefundReason(""); }}
                            className="text-error"
                          >
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between text-sm text-fg-muted">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!refundingId}
        title="Refund purchase"
        message={(() => {
          const target = purchases.find((p) => p.id === refundingId);
          if (!target) return "";
          const amount = `₹${Math.round(target.amountInPaise / 100).toLocaleString("en-IN")}`;
          return `Refund ${amount} for ${target.user?.email ?? "this user"}? Credits are clawed back immediately — complete the money refund in the Razorpay dashboard separately.`;
        })()}
        confirmLabel="Refund"
        danger
        confirmDisabled={refundReason.trim().length < 3}
        onConfirm={async () => {
          if (!refundingId) return;
          await refundMutation.mutateAsync({ purchaseId: refundingId, reason: refundReason.trim() });
        }}
        onClose={() => { setRefundingId(null); setRefundReason(""); }}
      >
        <input
          autoFocus
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          placeholder="Reason (required, min 3 characters)"
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </ConfirmDialog>
    </AdminShell>
  );
}
