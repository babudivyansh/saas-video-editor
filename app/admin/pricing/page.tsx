"use client";
import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

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
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [err, setErr]           = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    const res = await fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { plans: [] };
    setPlans(data.plans ?? []);
    setLoading(false);
  }, [token, user?.role]);

  useEffect(() => { load(); }, [load]);

  async function savePlan(p: Plan) {
    setSavingId(p.id);
    try {
      await fetch(`/api/admin/plans/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: p.name,
          priceInPaise: p.priceInPaise,
          credits: p.credits,
          features: p.features,
          active: p.active,
          sortOrder: p.sortOrder,
          kind: p.kind,
          intervalMonths: p.intervalMonths ?? null,
          monthlyCredits: p.monthlyCredits ?? null,
          tier: p.tier ?? null,
        }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function deletePlan(id: string) {
    await fetch(`/api/admin/plans/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setConfirmDelete(null);
    await load();
  }

  function edit(id: string, patch: Partial<Plan>) {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          priceInPaise: Number(form.priceInPaise),
          credits: Number(form.credits),
          sortOrder: Number(form.sortOrder),
          kind: form.kind,
          intervalMonths: form.intervalMonths !== "" ? Number(form.intervalMonths) : null,
          monthlyCredits: form.monthlyCredits !== "" ? Number(form.monthlyCredits) : null,
          tier: form.tier !== "" ? form.tier : null,
          features: form.features.split("\n").map(s => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setErr(d.error ?? "Failed to create plan");
        return;
      }
      setForm({ ...EMPTY });
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminShell title="Pricing">
      {loading ? (
        <p className="text-sm text-gray-400">Loading plans…</p>
      ) : (
        <div className="space-y-5">
          {plans.map(p => (
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
                  {confirmDelete === p.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => deletePlan(p.id)} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg">Confirm Delete</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(p.id)} className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">Delete</button>
                  )}
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
                <button onClick={() => savePlan(p)} disabled={savingId === p.id}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                  {savingId === p.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ))}

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
              <button type="submit" disabled={creating}
                className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                {creating ? "Creating…" : "Create Plan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
