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
  // Razorpay Plans are immutable, so these are the plan the customer is
  // actually charged against. Null = this currency falls back to a one-time
  // order at checkout: no auto-renewal, and a requested trial is dropped.
  razorpayPlanIdInr: string | null;
  razorpayPlanIdUsd: string | null;
}

const EMPTY = {
  slug: "", name: "", priceInPaise: 0, credits: 0, features: "", sortOrder: 0,
  kind: "pack", intervalMonths: "", monthlyCredits: "", tier: "",
};
const input = "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function AdminPricingPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [err, setErr]           = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [fxDraft, setFxDraft] = useState("");
  const [usdDraft, setUsdDraft] = useState<Record<string, string>>({});

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  // USD prices and the FX rate behind them were unreachable from the admin
  // panel entirely: lib/currency.ts's setters existed and were tested, but
  // nothing called them, so every non-INR price was effectively hardcoded.
  const currencyQuery = useQuery({
    queryKey: ["admin-currency"],
    queryFn: async () => {
      const res = await fetch("/api/admin/currency", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load currency config");
      return (await res.json()) as {
        fx: { inrPerUsd: number };
        priceBook: Record<string, number>;
        plans: { slug: string; name: string; kind: string; usdPriceInCents: number; source: "price_book" | "fx" }[];
      };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  const currencyMutation = useMutation({
    mutationFn: async (body: { inrPerUsd?: number; priceBook?: Record<string, number | null> }) => {
      const res = await fetch("/api/admin/currency", { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-currency"] });
      setUsdDraft({});
      setFxDraft("");
      showToast("USD pricing saved — re-sync affected plans so Razorpay charges the new amount.", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      return d as { resynced?: string[] };
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      showToast(
        d?.resynced?.length
          ? `Plan saved — new Razorpay plan minted for ${d.resynced.length} currency/ies. Existing subscribers keep their old price.`
          : "Plan saved",
        "success",
      );
    },
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

  // Provisions the Razorpay Plan a subscription row needs for true recurring
  // billing. Until this exists for a currency, checkout silently degrades to a
  // one-time order for it.
  const syncMutation = useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      const res = await fetch(`/api/admin/plans/${id}/sync-razorpay`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ force: force ?? false }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? d.results?.find((r: { error?: string }) => r.error)?.error ?? "Sync failed");
      return d as { results: Array<{ ok: boolean; currency: string; error?: string }> };
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      const failed = d.results.filter((r) => !r.ok);
      showToast(
        failed.length
          ? `Synced, but ${failed.map((r) => r.currency).join(", ")} failed.`
          : "Synced with Razorpay",
        failed.length ? "error" : "success",
      );
    },
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
        <p className="text-sm text-fg-subtle">Loading plans…</p>
      ) : (
        <div className="space-y-5">
          {plans.map(p => {
            const savingThis = saveMutation.isPending && saveMutation.variables?.id === p.id;
            return (
            <div key={p.id} className={`bg-panel rounded-2xl border shadow-sm p-6 ${p.active ? "border-line" : "border-line opacity-60"}`}>
              <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-fg">{p.name}</h3>
                  <span className="text-xs font-mono text-fg-subtle bg-surface-3 px-2 py-0.5 rounded">{p.slug}</span>
                  {!p.active && <span className="text-xs font-semibold text-error bg-error/10 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted cursor-pointer">
                    <input type="checkbox" checked={p.active} onChange={e => edit(p.id, { active: e.target.checked })} /> Active
                  </label>
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(p.id)}>Deactivate</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-fg-subtle block mb-1">Name</label>
                  <input className={input} value={p.name} onChange={e => edit(p.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-subtle block mb-1">Price (paise)</label>
                  <input type="number" className={input} value={p.priceInPaise} onChange={e => edit(p.id, { priceInPaise: Number(e.target.value) })} />
                  <p className="text-[10px] text-fg-subtle mt-1">= ₹{(p.priceInPaise / 100).toLocaleString("en-IN")}</p>
                  {p.kind === "subscription" && (p.razorpayPlanIdInr || p.razorpayPlanIdUsd) && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      Saving a new price mints a replacement Razorpay plan. Existing subscribers keep the price they bought at.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-subtle block mb-1">Credits (total)</label>
                  <input type="number" className={input} value={p.credits} onChange={e => edit(p.id, { credits: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-subtle block mb-1">Sort Order</label>
                  <input type="number" className={input} value={p.sortOrder} onChange={e => edit(p.id, { sortOrder: Number(e.target.value) })} />
                </div>
              </div>

              {/* Subscription-specific fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="text-xs font-semibold text-fg-subtle block mb-1">Kind</label>
                  <select className={input} value={p.kind} onChange={e => edit(p.id, { kind: e.target.value })}>
                    <option value="pack">pack</option>
                    <option value="subscription">subscription</option>
                    <option value="addon">addon</option>
                  </select>
                </div>
                {p.kind === "subscription" && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-fg-subtle block mb-1">Interval (months)</label>
                      <input type="number" className={input} value={p.intervalMonths ?? ""} onChange={e => edit(p.id, { intervalMonths: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-fg-subtle block mb-1">Monthly Credits</label>
                      <input type="number" className={input} value={p.monthlyCredits ?? ""} onChange={e => edit(p.id, { monthlyCredits: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-fg-subtle block mb-1">Tier</label>
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

              {p.kind === "subscription" && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <span className="text-xs font-semibold text-fg-muted">Razorpay recurring</span>
                  {([["INR", p.razorpayPlanIdInr], ["USD", p.razorpayPlanIdUsd]] as const).map(([cur, planId]) => (
                    <span
                      key={cur}
                      title={planId ?? "Not provisioned — checkout falls back to a one-time order for this currency (no auto-renewal, trial dropped)."}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${planId ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}
                    >
                      {cur}: {planId ? "synced" : "one-time only"}
                    </span>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => syncMutation.mutate({ id: p.id })} disabled={syncMutation.isPending}>
                    {syncMutation.isPending && syncMutation.variables?.id === p.id ? "Syncing…" : "Sync"}
                  </Button>
                </div>
              )}

              <div className="mt-4">
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Features (one per line)</label>
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

          {/* ── USD pricing ── */}
          <div className="bg-panel rounded-2xl border border-line shadow-sm p-6">
            <h3 className="font-bold text-fg mb-1">USD pricing</h3>
            <p className="text-xs text-fg-muted mb-4">
              INR is the source of truth. A plan either has an explicit USD price (an anchored
              figure like $15/$29/$59) or falls back to converting its rupee price at the FX rate
              below, rounded to a clean .99. Changing either only affects NEW checkouts — Razorpay
              Plans are immutable, so re-sync the affected plans above afterwards.
            </p>

            <div className="flex items-end gap-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1" htmlFor="fx-rate">INR per 1 USD</label>
                <input
                  id="fx-rate"
                  type="number"
                  className={input}
                  placeholder={String(currencyQuery.data?.fx.inrPerUsd ?? "")}
                  value={fxDraft}
                  onChange={(e) => setFxDraft(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => currencyMutation.mutate({ inrPerUsd: Number(fxDraft) })}
                disabled={!fxDraft || currencyMutation.isPending}
              >
                Save rate
              </Button>
              <p className="text-[11px] text-fg-subtle pb-2.5">
                Currently {currencyQuery.data?.fx.inrPerUsd ?? "…"} — used only by plans with no explicit USD price.
              </p>
            </div>

            <div className="space-y-2">
              {(currencyQuery.data?.plans ?? []).map((p) => (
                <div key={p.slug} className="flex flex-wrap items-center gap-3 border-t border-line pt-2">
                  <span className="text-sm text-fg flex-1 min-w-[160px]">{p.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.source === "price_book" ? "bg-tint-blue text-brand" : "bg-surface-3 text-fg-muted"
                  }`}>
                    {p.source === "price_book" ? "anchored" : "from FX"}
                  </span>
                  <span className="text-sm font-semibold text-fg w-20 text-right">
                    ${(p.usdPriceInCents / 100).toFixed(2)}
                  </span>
                  <input
                    type="number"
                    className={`${input} w-32`}
                    placeholder="cents"
                    aria-label={`USD price in cents for ${p.name}`}
                    value={usdDraft[p.slug] ?? ""}
                    onChange={(e) => setUsdDraft({ ...usdDraft, [p.slug]: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => currencyMutation.mutate({ priceBook: { [p.slug]: Number(usdDraft[p.slug]) } })}
                    disabled={!usdDraft[p.slug] || currencyMutation.isPending}
                  >
                    Set
                  </Button>
                  {p.source === "price_book" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => currencyMutation.mutate({ priceBook: { [p.slug]: null } })}
                      disabled={currencyMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Create new plan */}
          <form onSubmit={createPlan} className="bg-panel rounded-2xl border border-dashed border-line-strong p-6">
            <h3 className="font-bold text-fg mb-4">Add a new plan</h3>
            {err && <div className="text-sm text-error bg-error/10 rounded-xl px-4 py-2 mb-4">{err}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Slug</label>
                <input className={input} placeholder="pack_mega" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Name</label>
                <input className={input} placeholder="Mega Pack" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Price (paise)</label>
                <input type="number" className={input} value={form.priceInPaise} onChange={e => setForm({ ...form, priceInPaise: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Credits</label>
                <input type="number" className={input} value={form.credits} onChange={e => setForm({ ...form, credits: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Sort Order</label>
                <input type="number" className={input} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Kind</label>
                <select className={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  <option value="pack">pack</option>
                  <option value="subscription">subscription</option>
                  <option value="addon">addon</option>
                </select>
              </div>
              {form.kind === "subscription" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-fg-subtle block mb-1">Interval (months)</label>
                    <input type="number" className={input} value={form.intervalMonths} onChange={e => setForm({ ...form, intervalMonths: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-fg-subtle block mb-1">Monthly Credits</label>
                    <input type="number" className={input} value={form.monthlyCredits} onChange={e => setForm({ ...form, monthlyCredits: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-fg-subtle block mb-1">Tier</label>
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
              <label className="text-xs font-semibold text-fg-subtle block mb-1">Features (one per line)</label>
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
        message={`Deactivate "${plans.find(p => p.id === confirmDelete)?.name ?? ""}"? It stops being offered to new customers and disappears from /pricing. Anyone already on it keeps their access — and anyone on it via Razorpay recurring keeps being charged until they cancel or an admin clears their plan.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => { if (confirmDelete) await deleteMutation.mutateAsync(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
    </AdminShell>
  );
}
