"use client";

// AI model registry control: per-model enable/disable and credit repricing
// (runtime Config overrides — no deploy), plus AutoClip pricing, which had an
// API but no UI surface until now.

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface ModelRow {
  id: string;
  kind: "image" | "video";
  displayName: string;
  provider: string;
  category: string;
  allowedTiers: readonly string[];
  defaultCreditCost: number;
  costUsd: number | null;
  override: { enabled?: boolean; creditCost?: number } | null;
}
interface AutoclipPricing {
  base: number; perExtraClip: number; perMinute: number; rerender: number;
}

export default function AdminModelsPage() {
  const { token } = useAuth();
  const [image, setImage] = useState<ModelRow[]>([]);
  const [video, setVideo] = useState<ModelRow[]>([]);
  const [pricing, setPricing] = useState<AutoclipPricing | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const [mRes, pRes] = await Promise.all([
      fetch("/api/admin/models", { headers: headers() }),
      fetch("/api/admin/autoclip-pricing", { headers: headers() }),
    ]);
    if (mRes.ok) {
      const d = await mRes.json();
      setImage(d.image ?? []);
      setVideo(d.video ?? []);
    }
    if (pRes.ok) setPricing((await pRes.json()).pricing);
    setLoading(false);
  }, [token, headers]);

  useEffect(() => { load(); }, [load]);

  async function patchModel(modelId: string, body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ modelId, ...body }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.issues?.[0]?.message ?? d.error ?? "Update failed");
    }
    await load();
  }

  async function savePricing(patch: Partial<AutoclipPricing>) {
    setMsg(null);
    const res = await fetch("/api/admin/autoclip-pricing", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.issues?.[0]?.message ?? d.error ?? "Update failed");
    }
    await load();
  }

  return (
    <AdminShell title="AI Models">
      {msg && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2 mb-4">{msg}</p>}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-6">
          <ModelTable title="Image models" unit="credits / generation" rows={image} onPatch={patchModel} />
          <ModelTable title="Video models" unit="credits / second" rows={video} onPatch={patchModel} />

          {pricing && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-800 mb-1">AutoClip pricing</h2>
              <p className="text-xs text-gray-400 mb-4">Credits charged by the AutoClip pipeline — applies immediately, no deploy.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(Object.entries(pricing) as Array<[keyof AutoclipPricing, number]>).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-gray-400 block mb-1 capitalize">{key}</label>
                    <input
                      type="number"
                      min={0}
                      defaultValue={value}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isInteger(n) && n >= 0 && n !== value) savePricing({ [key]: n });
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}

function ModelTable({
  title, unit, rows, onPatch,
}: {
  title: string; unit: string; rows: ModelRow[];
  onPatch: (modelId: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-400">Cost unit: {unit} · overrides apply at generation time, instantly</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3">Model</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Tiers</th>
              <th className="px-4 py-3 text-right">Provider $</th>
              <th className="px-4 py-3 text-right">Credits</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((m) => {
              const disabled = m.override?.enabled === false;
              const effectiveCost = m.override?.creditCost ?? m.defaultCreditCost;
              return (
                <tr key={m.id} className={disabled ? "bg-red-50/40" : "hover:bg-gray-50"}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900">{m.displayName}</p>
                    <p className="text-xs text-gray-400 font-mono">{m.id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.provider}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.allowedTiers.join(", ")}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">{m.costUsd != null ? `$${m.costUsd}` : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min={0}
                      defaultValue={effectiveCost}
                      onBlur={(e) => {
                        const n = parseFloat(e.target.value);
                        if (!Number.isFinite(n) || n < 0 || n === effectiveCost) return;
                        onPatch(m.id, { creditCost: n });
                      }}
                      className={`w-20 border rounded-lg px-2 py-1 text-xs text-right ${m.override?.creditCost != null ? "border-blue-300 bg-blue-50 font-semibold" : "border-gray-200"}`}
                      aria-label={`${m.displayName} credit cost`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!disabled}
                        onChange={(e) => onPatch(m.id, { enabled: e.target.checked })}
                      />
                      <span className={disabled ? "text-red-600" : "text-gray-500"}>{disabled ? "Disabled" : "On"}</span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    {m.override ? (
                      <button onClick={() => onPatch(m.id, { clear: true })} className="text-xs text-gray-400 hover:text-red-600 cursor-pointer">
                        Reset to default
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">defaults</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
