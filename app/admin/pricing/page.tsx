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
}

const EMPTY = { slug: "", name: "", priceInPaise: 0, credits: 0, features: "", sortOrder: 0 };

export default function AdminPricingPage() {
  const { token, user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [err, setErr] = useState("");

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
        }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  function edit(id: string, patch: Partial<Plan>) {
    setPlans(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
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

  const input = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AdminShell title="Pricing">
      {loading ? (
        <p className="text-sm text-gray-400">Loading plans…</p>
      ) : (
        <div className="space-y-6">
          {plans.map(p => (
            <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-6 ${p.active ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{p.slug}</span>
                  {!p.active && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                  <input type="checkbox" checked={p.active} onChange={e => edit(p.id, { active: e.target.checked })} /> Active
                </label>
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
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Credits</label>
                  <input type="number" className={input} value={p.credits} onChange={e => edit(p.id, { credits: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Sort Order</label>
                  <input type="number" className={input} value={p.sortOrder} onChange={e => edit(p.id, { sortOrder: Number(e.target.value) })} />
                </div>
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
