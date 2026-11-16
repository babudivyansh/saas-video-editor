"use client";

// Admin → Affiliates → Creators: the creator partner programme
// (lib/creator-program.ts). Programme settings on top, then every creator with
// their progress toward the free year of Pro, and the button that grants it.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Switch } from "@/app/components/ui/Switch";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { Input } from "@/app/components/ui/Field";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";

type Tier = "lite" | "creator" | "pro" | "studio";

interface Settings {
  enabled: boolean;
  discountPct: number;
  razorpayOfferId: string | null;
  goal: number;
  qualifyingTiers: Tier[];
}

interface CreatorRow {
  id: string;
  code: string;
  status: string;
  handle: string | null;
  since: string | null;
  user: { name: string | null; email: string };
  signups: number;
  paying: number;
  qualified: number;
  totalEarned: number;
  goalReachedAt: string | null;
  rewardGrantedAt: string | null;
  stage: "in_progress" | "goal_reached" | "granted";
}

const TIERS: { id: Tier; label: string }[] = [
  { id: "lite", label: "Lite" },
  { id: "creator", label: "Creator" },
  { id: "pro", label: "Pro" },
  { id: "studio", label: "Studio" },
];

const STAGE: Record<CreatorRow["stage"], { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-surface-3 text-fg-muted" },
  goal_reached: { label: "Goal reached", cls: "bg-warning/15 text-warning" },
  granted: { label: "Pro granted", cls: "bg-success/15 text-success" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function readError(res: Response, fallback: string): Promise<string> {
  const d = await res.json().catch(() => ({}));
  return d.issues?.[0] ? `${d.issues[0].path}: ${d.issues[0].message}` : d.error ?? fallback;
}

export function CreatorsTab({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const appUrl = typeof window !== "undefined" ? window.location.origin.replace("://admin.", "://") : "";

  const query = useQuery({
    queryKey: ["admin-creator-program"],
    queryFn: async () => {
      const res = await fetch("/api/admin/creator-program", { headers: authHeaders() });
      if (!res.ok) throw new Error(await readError(res, "Failed to load creators"));
      return (await res.json()) as { settings: Settings; creators: CreatorRow[] };
    },
  });

  // ── Settings form ── null = untouched, so it shows the saved settings.
  const [draft, setDraft] = useState<Settings | null>(null);
  const [offerDraft, setOfferDraft] = useState<string | null>(null);
  const form = draft ?? query.data?.settings ?? null;
  const setForm = (s: Settings) => setDraft(s);
  const offerText = offerDraft ?? query.data?.settings.razorpayOfferId ?? "";
  const setOfferText = (v: string) => setOfferDraft(v);

  const saveSettings = useMutation({
    mutationFn: async (s: Settings) => {
      const res = await fetch("/api/admin/creator-program", { method: "PUT", headers: authHeaders(), body: JSON.stringify(s) });
      if (!res.ok) throw new Error(await readError(res, "Save failed"));
      return (await res.json()) as { settings: Settings };
    },
    onSuccess: (d) => {
      queryClient.setQueryData(["admin-creator-program"], (old: { settings: Settings; creators: CreatorRow[] } | undefined) =>
        old ? { ...old, settings: d.settings } : old);
      setDraft(null);
      setOfferDraft(null);
      showToast("Creator programme saved.", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-creator-program"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  // ── Add creator ──
  const [addEmail, setAddEmail] = useState("");
  const [addHandle, setAddHandle] = useState("");
  const addCreator = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/creator-program", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: addEmail.trim(), ...(addHandle.trim() ? { handle: addHandle.trim() } : {}) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't add creator"));
    },
    onSuccess: () => {
      setAddEmail("");
      setAddHandle("");
      showToast("Creator partner added.", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-creator-program"] });
      queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  // ── Row actions ──
  const patchAffiliate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => {
      const res = await fetch(`/api/admin/affiliates/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await readError(res, "Update failed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-creator-program"] });
      queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const grant = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/creator-program/${id}/grant`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(await readError(res, "Grant failed"));
      return (await res.json()) as { planName: string; endsAt: string };
    },
    onSuccess: (d) => {
      showToast(`${d.planName} granted until ${fmtDate(d.endsAt)}.`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin-creator-program"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const [confirmGrant, setConfirmGrant] = useState<CreatorRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CreatorRow | null>(null);

  if (query.isLoading || !form) return <p className="text-sm text-fg-subtle">Loading...</p>;
  if (query.isError) {
    return (
      <Card shadow padding="md" className="text-sm text-error">
        {(query.error as Error).message}{" "}
        <Button variant="link" onClick={() => query.refetch()}>Retry</Button>
      </Card>
    );
  }

  const creators = query.data?.creators ?? [];
  const saved = query.data!.settings;
  const discountLive = saved.enabled && !!saved.razorpayOfferId;
  const offerInvalid = offerText.trim() !== "" && !/^offer_[A-Za-z0-9]{14}$/.test(offerText.trim());
  const awaitingGrant = creators.filter((c) => c.stage === "goal_reached").length;

  return (
    <div className="space-y-6">
      {/* Programme settings */}
      <Card shadow padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-fg">Creator programme</h2>
            <p className="mt-1 max-w-xl text-sm text-fg-muted">
              People who sign up through a creator partner&apos;s link get a discount on their first payment. When{" "}
              {saved.goal} of them buy a qualifying plan, the creator earns a free year of Pro, which you grant below.
              Creators also earn their normal affiliate commission.
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${discountLive ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
            {discountLive ? `Discount live · ${saved.discountPct}% off` : "Discount off"}
          </span>
        </div>

        {!discountLive && (
          <p role="note" className="mt-4 rounded-xl border border-tint-amber-border bg-tint-amber px-3.5 py-2.5 text-[13px] text-fg-muted">
            {saved.enabled
              ? "No discount is shown or charged until you paste a Razorpay Offer ID. Sales still count toward the goal."
              : "The programme is switched off: no discount, and new purchases don't count toward the goal."}
          </p>
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Creator programme on" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Discount for buyers (%)</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.discountPct}
              onChange={(e) => setForm({ ...form, discountPct: parseInt(e.target.value, 10) || 0 })}
              hint="Must match the Razorpay Offer — the offer is what's actually charged on plans."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Razorpay Offer ID</span>
            <Input
              type="text"
              placeholder="offer_XXXXXXXXXXXXXX"
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              error={offerInvalid ? "Should look like offer_ followed by 14 letters or numbers." : null}
              hint="Razorpay Dashboard → Subscriptions → Offers. Set it to 1 billing cycle and link it to every plan."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Sales needed for the free year</span>
            <Input
              type="number"
              min={1}
              max={1000}
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Plans that count as a sale</span>
            <div className="flex flex-wrap gap-4 pt-1.5">
              {TIERS.map((t) => (
                <Checkbox
                  key={t.id}
                  checked={form.qualifyingTiers.includes(t.id)}
                  onChange={(on) =>
                    setForm({
                      ...form,
                      qualifyingTiers: on ? [...form.qualifyingTiers, t.id] : form.qualifyingTiers.filter((x) => x !== t.id),
                    })
                  }
                  label={t.label}
                  showLabel
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            disabled={saveSettings.isPending || offerInvalid || form.qualifyingTiers.length === 0}
            onClick={() => saveSettings.mutate({ ...form, razorpayOfferId: offerText.trim() || null })}
          >
            {saveSettings.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>

      {/* Add creator */}
      <Card shadow padding="md">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => { e.preventDefault(); if (addEmail.trim()) addCreator.mutate(); }}
        >
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Creator&apos;s Clipiro account email</span>
            <Input type="email" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="creator@example.com" />
          </label>
          <label className="block w-48">
            <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Instagram handle</span>
            <Input type="text" value={addHandle} onChange={(e) => setAddHandle(e.target.value)} placeholder="@handle" />
          </label>
          <Button type="submit" variant="secondary" disabled={addCreator.isPending}>
            {addCreator.isPending ? "Adding…" : "Add creator partner"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-fg-subtle">
          The creator signs up first. Adding them creates their referral link if they don&apos;t have one.
        </p>
      </Card>

      {/* Creators */}
      <Card shadow>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-fg">Creator partners ({creators.length})</h3>
          {awaitingGrant > 0 && (
            <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
              {awaitingGrant} waiting for their free year
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted">
                <th className="px-5 py-3">Creator</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Sign-ups</th>
                <th className="px-4 py-3">Sales toward goal</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {creators.map((c) => {
                const pct = Math.min(100, Math.round((c.qualified / saved.goal) * 100));
                const link = `${appUrl}/register?ref=${c.code}`;
                return (
                  <tr key={c.id} className="align-top hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{c.handle ?? c.user.name ?? "—"}</p>
                      <p className="text-xs text-fg-subtle">{c.user.email}</p>
                      {c.since && <p className="text-xs text-fg-subtle">Partner since {fmtDate(c.since)}</p>}
                      {c.status !== "active" && <p className="text-xs font-semibold text-error">Affiliate {c.status} — link inactive</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-fg-muted">{c.code}</p>
                      <Button
                        variant="link"
                        onClick={() => {
                          navigator.clipboard?.writeText(link).then(
                            () => showToast("Link copied.", "success"),
                            () => showToast(link, "info"),
                          );
                        }}
                      >
                        Copy link
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {c.signups}
                      <span className="block text-xs text-fg-subtle">{c.paying} paying</span>
                    </td>
                    <td className="min-w-[160px] px-4 py-3">
                      <p className="font-semibold text-fg">{c.qualified} / {saved.goal}</p>
                      <div
                        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                        role="progressbar"
                        aria-valuenow={c.qualified}
                        aria-valuemin={0}
                        aria-valuemax={saved.goal}
                        aria-label={`${c.qualified} of ${saved.goal} qualifying sales`}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-fg">₹{c.totalEarned.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE[c.stage].cls}`}>{STAGE[c.stage].label}</span>
                      {c.rewardGrantedAt && <p className="mt-1 text-xs text-fg-subtle">{fmtDate(c.rewardGrantedAt)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {c.stage === "goal_reached" && (
                          <Button variant="primary" onClick={() => setConfirmGrant(c)} disabled={grant.isPending}>
                            Grant 1 year of Pro
                          </Button>
                        )}
                        <Button
                          variant="link"
                          onClick={() => {
                            const next = window.prompt("Instagram handle", c.handle ?? "");
                            if (next !== null) patchAffiliate.mutate({ id: c.id, data: { creatorHandle: next.trim() || null } });
                          }}
                        >
                          Edit handle
                        </Button>
                        <Button variant="link" className="text-error" onClick={() => setConfirmRemove(c)}>
                          Remove partner
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {creators.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-fg-subtle">
                    No creator partners yet. Add one by email above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!confirmGrant}
        title="Grant a free year of Pro"
        message={
          confirmGrant
            ? `Give ${confirmGrant.handle ?? confirmGrant.user.email} the yearly Pro plan for free? It starts today, adds this month's minutes and credits now, and refills monthly for 12 months.`
            : ""
        }
        confirmLabel="Grant Pro"
        onConfirm={async () => {
          if (confirmGrant) await grant.mutateAsync(confirmGrant.id);
        }}
        onClose={() => setConfirmGrant(null)}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove creator partner"
        message={
          confirmRemove
            ? `Remove ${confirmRemove.handle ?? confirmRemove.user.email} from the creator programme? Their link stops giving the discount and new sales stop counting. Their affiliate commission is unchanged.`
            : ""
        }
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (confirmRemove) await patchAffiliate.mutateAsync({ id: confirmRemove.id, data: { isCreatorPartner: false } });
        }}
        onClose={() => setConfirmRemove(null)}
      />
    </div>
  );
}
