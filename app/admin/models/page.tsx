"use client";

// AI model registry control: per-model enable/disable and credit repricing
// (runtime Config overrides — no deploy), plus AutoClip pricing, which had an
// API but no UI surface until now.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

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
  perClip: number; perTwoMinutes: number; analysisPerHalfHour: number; rerender: number;
}

export default function AdminModelsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-models"],
    queryFn: async () => {
      const [mRes, pRes] = await Promise.all([
        fetch("/api/admin/models", { headers: headers() }),
        fetch("/api/admin/autoclip-pricing", { headers: headers() }),
      ]);
      if (!mRes.ok) throw new Error("Failed to load models");
      const m = (await mRes.json()) as { image?: ModelRow[]; video?: ModelRow[] };
      const pricing = pRes.ok ? ((await pRes.json()) as { pricing: AutoclipPricing }).pricing : null;
      return { image: m.image ?? [], video: m.video ?? [], pricing };
    },
    enabled: !!token,
  });

  const patchModelMutation = useMutation({
    mutationFn: async ({ modelId, body }: { modelId: string; body: Record<string, unknown> }) => {
      const res = await fetch("/api/admin/models", { method: "PATCH", headers: headers(), body: JSON.stringify({ modelId, ...body }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).issues?.[0]?.message ?? "Update failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-models"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const savePricingMutation = useMutation({
    mutationFn: async (patch: Partial<AutoclipPricing>) => {
      const res = await fetch("/api/admin/autoclip-pricing", { method: "PATCH", headers: headers(), body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).issues?.[0]?.message ?? "Update failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-models"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const image = data?.image ?? [];
  const video = data?.video ?? [];
  const pricing = data?.pricing ?? null;

  return (
    <AdminShell title="AI Models">
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : (
        <div className="space-y-6">
          <ModelTable title="Image models" unit="credits / generation" rows={image} onPatch={(modelId, body) => patchModelMutation.mutate({ modelId, body })} />
          <ModelTable title="Video models" unit="credits / second" rows={video} onPatch={(modelId, body) => patchModelMutation.mutate({ modelId, body })} />

          {pricing && (
            <Card shadow padding="lg">
              <h2 className="text-base font-bold text-fg mb-1">AutoClip pricing</h2>
              <p className="text-xs text-fg-subtle mb-4">Credits charged by the AutoClip pipeline — applies immediately, no deploy.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(Object.entries(pricing) as Array<[keyof AutoclipPricing, number]>).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-fg-subtle block mb-1 capitalize">{key}</label>
                    <input
                      type="number"
                      min={0}
                      defaultValue={value}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isInteger(n) && n >= 0 && n !== value) savePricingMutation.mutate({ [key]: n });
                      }}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </Card>
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
  onPatch: (modelId: string, body: Record<string, unknown>) => void;
}) {
  return (
    <Card shadow padding="none">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-base font-bold text-fg">{title}</h2>
        <p className="text-xs text-fg-subtle">Cost unit: {unit} · overrides apply at generation time, instantly</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide">
              <th className="px-6 py-3">Model</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Tiers</th>
              <th className="px-4 py-3 text-right">Provider $</th>
              <th className="px-4 py-3 text-right">Credits</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => {
              const disabled = m.override?.enabled === false;
              const effectiveCost = m.override?.creditCost ?? m.defaultCreditCost;
              return (
                <tr key={m.id} className={disabled ? "bg-red-50/40" : "hover:bg-surface-2"}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-fg">{m.displayName}</p>
                    <p className="text-xs text-fg-subtle font-mono">{m.id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{m.provider}</td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{m.allowedTiers.join(", ")}</td>
                  <td className="px-4 py-3 text-right text-xs text-fg-muted">{m.costUsd != null ? `$${m.costUsd}` : "—"}</td>
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
                      className={`w-20 border rounded-lg px-2 py-1 text-xs text-right ${m.override?.creditCost != null ? "border-brand/60 bg-tint-blue font-semibold" : "border-line"}`}
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
                      <span className={disabled ? "text-error" : "text-fg-muted"}>{disabled ? "Disabled" : "On"}</span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    {m.override ? (
                      <Button variant="link" onClick={() => onPatch(m.id, { clear: true })} className="text-fg-subtle hover:text-error">
                        Reset to default
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-subtle">defaults</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
