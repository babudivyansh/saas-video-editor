"use client";
import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Tool {
  slug: string;
  service: string;
  enabled: boolean;
  creditCost: number;
}

export default function AdminToolsPage() {
  const { token, user } = useAuth();
  const [tools, setTools]       = useState<Tool[]>([]);
  const [loading, setLoading]   = useState(true);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [editCost, setEditCost] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const res = await fetch("/api/admin/tools", { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { tools: [] };
    const list: Tool[] = data.tools ?? [];
    setTools(list);
    const costs: Record<string, string> = {};
    for (const t of list) costs[t.slug] = String(t.creditCost);
    setEditCost(costs);
    setLoading(false);
  }, [token, user?.role]);

  useEffect(() => { load(); }, [load]);

  async function patch(slug: string, body: { enabled?: boolean; creditCost?: number }) {
    setSavingSlug(slug);
    try {
      const res = await fetch("/api/admin/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug, ...body }),
      });
      if (res.ok) {
        setTools(prev => prev.map(t => t.slug === slug ? { ...t, ...body } : t));
      }
    } finally {
      setSavingSlug(null);
    }
  }

  function saveCost(slug: string) {
    const n = parseInt(editCost[slug] ?? "0", 10);
    if (!isNaN(n) && n >= 0) patch(slug, { creditCost: n });
  }

  return (
    <AdminShell title="Tools">
      <p className="text-sm text-gray-500 mb-6">
        Enable/disable tools in real-time and override their credit cost. Changes take effect within 60 seconds (Redis cache).
      </p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading tools…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="py-3.5 px-5">Tool</th>
                  <th className="py-3.5 px-3">API Service</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Credit Cost</th>
                  <th className="py-3.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tools.map(t => {
                  const busy = savingSlug === t.slug;
                  return (
                    <tr key={t.slug} className={`border-b border-gray-50 last:border-0 ${!t.enabled ? "opacity-50" : ""}`}>
                      <td className="py-3 px-5">
                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{t.slug}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-500 text-xs">{t.service}</td>
                      <td className="py-3 px-3">
                        {t.enabled
                          ? <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">ENABLED</span>
                          : <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">DISABLED</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={editCost[t.slug] ?? String(t.creditCost)}
                            onChange={e => setEditCost(prev => ({ ...prev, [t.slug]: e.target.value }))}
                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => saveCost(t.slug)}
                            disabled={busy}
                            className="text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            {busy ? "…" : "Set"}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => patch(t.slug, { enabled: !t.enabled })}
                          disabled={busy}
                          className={`text-xs font-semibold px-4 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            t.enabled
                              ? "text-red-600 border-red-200 hover:bg-red-50"
                              : "text-green-700 border-green-200 hover:bg-green-50"
                          }`}>
                          {busy ? "…" : t.enabled ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
