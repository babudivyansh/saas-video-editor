"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

interface Plan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  currency: string;
  credits: number;
  features: string[];
  active: boolean;
  sortOrder: number;
  kind: string;
  intervalMonths: number | null;
  monthlyCredits: number | null;
  tier: string | null;
}

const EMPTY = {
  slug: "", name: "", priceInPaise: 0, credits: 0, features: "", sortOrder: 0,
  kind: "pack", intervalMonths: "", monthlyCredits: "", tier: "",
};
const input = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function AdminPricingPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [err, setErr]           = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load plans");
      return (await res.json()) as { plans?: Plan[] };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  // Editable working copy, same pattern as Coupons — server data is the
  // source of truth on load/save, fields are edited in place before Save.
  const [localPlans, setLocalPlans] = useState<Plan[] | null>(null);
  useEffect(() => { if (data) setLocalPlans(data.plans ?? []); }, [data]);
  const plans = localPlans ?? [];

  const saveMutation = useMutation({
    mutationFn: async (p: Plan) => {
      const res = await fetch(`/api/admin/plans/${p.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({
          name: p.name, priceInPaise: p.priceInPaise, credits: p.credits, features: p.features,
          active: p.active, sortOrder: p.sortOrder, kind: p.kind,
          intervalMonths: p.intervalMonths ?? null, monthlyCredits: p.monthlyCredits ?? null, tier: p.tier ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-plans"] }); showToast("Plan saved", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Deactivate failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-plans"] }); showToast("Plan deactivated", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          slug: form.slug, name: form.name, priceInPaise: Number(form.priceInPaise), credits: Number(form.credits),
          sortOrder: Number(form.sortOrder), kind: form.kind,
          intervalMonths: form.intervalMonths !== "" ? Number(form.intervalMonths) : null,
          monthlyCredits: form.monthlyCredits !== "" ? Number(form.monthlyCredits) : null,
          tier: form.tier !== "" ? form.tier : null,
          features: form.features.split("\n").map(s => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create plan");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-plans"] }); setForm({ ...EMPTY }); setErr(""); },
    onError: (e: Error) => setErr(e.message),
  });

  function edit(id: string, patch: Partial<Plan>) {
    setLocalPlans(prev => prev ? prev.map(p => p.id === id ? { ...p, ...patch } : p) : prev);
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try { await createMutation.mutateAsync(); } finally { setCreating(false); }
  }

  return (
    <AdminShell title="Pricing">
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading plans…</p>
      ) : (
        <div className="space-y-5">
          {plans.map(p => {
            const savingThis = saveMutation.isPending && saveMutation.variables?.id === p.id;
            return (
            <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-6 ${p.active ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{p.slug}</span>
                  {!p.active && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={p.active} onChange={e => edit(p.id, { active: e.target.checked })} /> Active
                  </label>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(p.id)}>Deactivate</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Name</label>
                  <input className={input} value={p.name} onChange={e => edit(p.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Price (paise)</label>
                  <input type="number" className={input} value={p.priceInPaise} onChange={e => edit(p.id, { priceInPaise: Number(e.target.value) })} />
                  <p className="text-[10px] text-gray-400 mt-1">= ₹{(p.priceInPaise / 100).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Credits (total)</label>
                  <input type="number" className={input} value={p.credits} onChange={e => edit(p.id, { credits: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Sort Order</label>
                  <input type="number" className={input} value={p.sortOrder} onChange={e => edit(p.id, { sortOrder: Number(e.target.value) })} />
                </div>
              </div>

              {/* Subscription-specific fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Kind</label>
                  <select className={input} value={p.kind} onChange={e => edit(p.id, { kind: e.target.value })}>
                    <option value="pack">pack</option>
                    <option value="subscription">subscription</option>
                    <option value="addon">addon</option>
                  </select>
                </div>
                {p.kind === "subscription" && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Interval (months)</label>
                      <input type="number" className={input} value={p.intervalMonths ?? ""} onChange={e => edit(p.id, { intervalMonths: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Monthly Credits</label>
                      <input type="number" className={input} value={p.monthlyCredits ?? ""} onChange={e => edit(p.id, { monthlyCredits: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Tier</label>
                      <select className={input} value={p.tier ?? ""} onChange={e => edit(p.id, { tier: e.target.value || null })}>
                        <option value="">— none —</option>
                        <option value="creator">creator</option>
                        <option value="pro">pro</option>
                        <option value="studio">studio</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-400 block mb-1">Features (one per line)</label>
                <textarea className={`${input} h-24 resize-y`} value={p.features.join("\n")}
                  onChange={e => edit(p.id, { features: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} />
              </div>
              <div className="flex justify-end mt-4">
                <Button variant="primary" onClick={() => saveMutation.mutate(p)} disabled={savingThis}>
                  {savingThis ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
            );
          })}

          {/* Create new plan */}
          <form onSubmit={createPlan} className="bg-white rounded-2xl border border-dashed border-gray-300 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Add a new plan</h3>
            {err && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2 mb-4">{err}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Slug</label>
                <input className={input} placeholder="pack_mega" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Name</label>
                <input className={input} placeholder="Mega Pack" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Price (paise)</label>
                <input type="number" className={input} value={form.priceInPaise} onChange={e => setForm({ ...form, priceInPaise: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Credits</label>
                <input type="number" className={input} value={form.credits} onChange={e => setForm({ ...form, credits: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Sort Order</label>
                <input type="number" className={input} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Kind</label>
                <select className={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  <option value="pack">pack</option>
                  <option value="subscription">subscription</option>
                  <option value="addon">addon</option>
                </select>
              </div>
              {form.kind === "subscription" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Interval (months)</label>
                    <input type="number" className={input} value={form.intervalMonths} onChange={e => setForm({ ...form, intervalMonths: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Monthly Credits</label>
                    <input type="number" className={input} value={form.monthlyCredits} onChange={e => setForm({ ...form, monthlyCredits: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1">Tier</label>
                    <select className={input} value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}>
                      <option value="">— none —</option>
                      <option value="creator">creator</option>
                      <option value="pro">pro</option>
                      <option value="studio">studio</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-400 block mb-1">Features (one per line)</label>
              <textarea className={`${input} h-20 resize-y`} value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} />
            </div>
            <div className="flex justify-end mt-4">
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? "Creating…" : "Create Plan"}
              </Button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Deactivate plan"
        message={`Deactivate "${plans.find(p => p.id === confirmDelete)?.name ?? ""}"? It stops being offered to new customers; existing subscribers are unaffected.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => { if (confirmDelete) await deleteMutation.mutateAsync(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
    </AdminShell>
  );
}
