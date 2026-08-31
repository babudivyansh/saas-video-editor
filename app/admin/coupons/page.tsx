"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  appliesTo: string;
  planSlugs: string[];
  minAmountInPaise: number;
  maxRedemptions: number | null;
  perUserLimit: number;
  timesRedeemed: number;
  firstPurchaseOnly: boolean;
  featured: boolean;
  active: boolean;
  expiresAt: string | null;
  _count?: { redemptions: number };
}

const EMPTY = {
  code: "", description: "", discountType: "percent", discountValue: 10,
  appliesTo: "subscription", minAmountInPaise: 0, maxRedemptions: "",
  perUserLimit: 1, firstPurchaseOnly: false, featured: false, expiresAt: "",
};
const input = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function AdminCouponsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [err, setErr]           = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [redemptionsFor, setRedemptionsFor] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const res = await fetch("/api/admin/coupons", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load coupons");
      return (await res.json()) as { coupons?: Coupon[] };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  // Editable working copy — server data is the source of truth on load/save,
  // but fields are edited in place before an explicit Save, same as before.
  const [localCoupons, setLocalCoupons] = useState<Coupon[] | null>(null);
  useEffect(() => { if (data) setLocalCoupons(data.coupons ?? []); }, [data]);
  const coupons = localCoupons ?? [];

  const { data: redemptions } = useQuery({
    queryKey: ["admin-coupon-redemptions", redemptionsFor],
    queryFn: async () => {
      const res = await fetch(`/api/admin/coupons/${redemptionsFor}/redemptions`, { headers: headers() });
      if (!res.ok) return { redemptions: [] };
      return (await res.json()) as { redemptions: Array<{ id: string; discountInPaise: number; orderId: string | null; createdAt: string; user: { email: string; name: string | null } }> };
    },
    enabled: !!redemptionsFor,
  });

  const saveMutation = useMutation({
    mutationFn: async (c: Coupon) => {
      const res = await fetch(`/api/admin/coupons/${c.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({
          description: c.description, discountType: c.discountType, discountValue: c.discountValue,
          appliesTo: c.appliesTo, minAmountInPaise: c.minAmountInPaise,
          maxRedemptions: c.maxRedemptions, perUserLimit: c.perUserLimit,
          firstPurchaseOnly: c.firstPurchaseOnly, featured: c.featured, active: c.active,
          expiresAt: c.expiresAt,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }); showToast("Coupon saved", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Deactivate failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }); showToast("Coupon deactivated", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          appliesTo: form.appliesTo,
          minAmountInPaise: Number(form.minAmountInPaise) || 0,
          maxRedemptions: form.maxRedemptions !== "" ? Number(form.maxRedemptions) : null,
          perUserLimit: Number(form.perUserLimit) || 1,
          firstPurchaseOnly: form.firstPurchaseOnly,
          featured: form.featured,
          expiresAt: form.expiresAt || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create coupon");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }); setForm({ ...EMPTY }); setErr(""); },
    onError: (e: Error) => setErr(e.message),
  });

  function edit(id: string, patch: Partial<Coupon>) {
    setLocalCoupons(prev => prev ? prev.map(c => c.id === id ? { ...c, ...patch } : c) : prev);
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try { await createMutation.mutateAsync(); } finally { setCreating(false); }
  }

  const valueLabel = (c: { discountType: string; discountValue: number }) =>
    c.discountType === "percent" ? `${c.discountValue}% off` : `₹${Math.round(c.discountValue / 100).toLocaleString("en-IN")} off`;

  return (
    <AdminShell title="Coupons">
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading coupons…</p>
      ) : (
        <div className="space-y-5">
          {coupons.length === 0 && (
            <p className="text-sm text-gray-400">No coupons yet — create your first launch code below.</p>
          )}

          {coupons.map(c => {
            const savingThis = saveMutation.isPending && saveMutation.variables?.id === c.id;
            return (
            <div key={c.id} className={`bg-white rounded-2xl border shadow-sm p-6 ${c.active ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-mono font-bold text-gray-900 tracking-wide">{c.code}</h3>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{valueLabel(c)}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{c.appliesTo}</span>
                  {c.featured && <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Featured</span>}
                  {c.firstPurchaseOnly && <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">1st purchase</span>}
                  {!c.active && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="link"
                    onClick={() => setRedemptionsFor(redemptionsFor === c.id ? null : c.id)}
                    disabled={c.timesRedeemed === 0}
                    className="text-gray-500 hover:text-blue-600"
                  >
                    Used <strong>{c.timesRedeemed}</strong>{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    {c.timesRedeemed > 0 && <span className="ml-1">{redemptionsFor === c.id ? "▴" : "▾"}</span>}
                  </Button>
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={c.active} onChange={e => edit(c.id, { active: e.target.checked })} /> Active
                  </label>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(c.id)}>Deactivate</Button>
                </div>
              </div>

              {redemptionsFor === c.id && (
                <div className="mb-4 bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Redemptions</p>
                  {!redemptions ? (
                    <p className="text-xs text-gray-400">Loading…</p>
                  ) : redemptions.redemptions.length === 0 ? (
                    <p className="text-xs text-gray-400">No redemptions recorded.</p>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {redemptions.redemptions.map(r => (
                          <tr key={r.id} className="border-t border-gray-100 first:border-0">
                            <td className="py-1.5 text-gray-700">{r.user.email}</td>
                            <td className="py-1.5 text-gray-400">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                            <td className="py-1.5 text-right font-semibold text-gray-700">−₹{(r.discountInPaise / 100).toFixed(0)}</td>
                            <td className="py-1.5 text-right text-gray-400 font-mono">{r.orderId ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Type</label>
                  <select className={input} value={c.discountType} onChange={e => edit(c.id, { discountType: e.target.value })}>
                    <option value="percent">percent (%)</option>
                    <option value="fixed">fixed (₹ in paise)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Value {c.discountType === "percent" ? "(%)" : "(paise)"}</label>
                  <input type="number" className={input} value={c.discountValue} onChange={e => edit(c.id, { discountValue: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Applies to</label>
                  <select className={input} value={c.appliesTo} onChange={e => edit(c.id, { appliesTo: e.target.value })}>
                    <option value="all">all</option>
                    <option value="subscription">subscription</option>
                    <option value="pack">pack (top-ups)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Min order (paise)</label>
                  <input type="number" className={input} value={c.minAmountInPaise} onChange={e => edit(c.id, { minAmountInPaise: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Max redemptions</label>
                  <input type="number" className={input} placeholder="∞" value={c.maxRedemptions ?? ""} onChange={e => edit(c.id, { maxRedemptions: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Per-user limit</label>
                  <input type="number" className={input} value={c.perUserLimit} onChange={e => edit(c.id, { perUserLimit: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Expires</label>
                  <input type="date" className={input} value={c.expiresAt ? c.expiresAt.split("T")[0] : ""} onChange={e => edit(c.id, { expiresAt: e.target.value || null })} />
                  <p className="text-[10px] text-gray-400 mt-1">{c.expiresAt ? fmtDate(c.expiresAt) : "never"}</p>
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={c.firstPurchaseOnly} onChange={e => edit(c.id, { firstPurchaseOnly: e.target.checked })} /> 1st only
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={c.featured} onChange={e => edit(c.id, { featured: e.target.checked })} /> Featured
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-400 block mb-1">Description</label>
                <input className={input} value={c.description ?? ""} onChange={e => edit(c.id, { description: e.target.value })} />
              </div>
              <div className="flex justify-end mt-4">
                <Button variant="primary" onClick={() => saveMutation.mutate(c)} disabled={savingThis}>
                  {savingThis ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
            );
          })}

          {/* Create new coupon */}
          <form onSubmit={createCoupon} className="bg-white rounded-2xl border border-dashed border-gray-300 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Create a coupon</h3>
            {err && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2 mb-4">{err}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Code</label>
                <input className={`${input} font-mono uppercase`} placeholder="LAUNCH30" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Type</label>
                <select className={input} value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}>
                  <option value="percent">percent (%)</option>
                  <option value="fixed">fixed (₹ in paise)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Value {form.discountType === "percent" ? "(%)" : "(paise)"}</label>
                <input type="number" className={input} value={form.discountValue} onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Applies to</label>
                <select className={input} value={form.appliesTo} onChange={e => setForm({ ...form, appliesTo: e.target.value })}>
                  <option value="all">all</option>
                  <option value="subscription">subscription</option>
                  <option value="pack">pack (top-ups)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Min order (paise)</label>
                <input type="number" className={input} value={form.minAmountInPaise} onChange={e => setForm({ ...form, minAmountInPaise: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Max redemptions</label>
                <input type="number" className={input} placeholder="∞" value={form.maxRedemptions} onChange={e => setForm({ ...form, maxRedemptions: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Per-user limit</label>
                <input type="number" className={input} value={form.perUserLimit} onChange={e => setForm({ ...form, perUserLimit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Expires</label>
                <input type="date" className={input} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={form.firstPurchaseOnly} onChange={e => setForm({ ...form, firstPurchaseOnly: e.target.checked })} /> 1st only
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Featured
                </label>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-400 block mb-1">Description</label>
              <input className={input} placeholder="Launch special — 30% off your first plan" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex justify-end mt-4">
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? "Creating…" : "Create Coupon"}
              </Button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Deactivate coupon"
        message={`Deactivate "${coupons.find(c => c.id === confirmDelete)?.code ?? ""}"? It stops working for new redemptions immediately.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => { if (confirmDelete) await deleteMutation.mutateAsync(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
    </AdminShell>
  );
}
