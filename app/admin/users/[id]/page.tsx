"use client";

// One account, every control: Overview (profile, balances, notes, affiliate,
// social), Security (sign-in, 2FA, email, password, devices, login history),
// Billing (subscription, renewal cancel, purchases + refund, credit ledger,
// credit/minute adjust), Content (projects + library, with delete), and
// Data (export + delete account). Destructive actions need the user's email typed; every
// action is audited.

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Tabs } from "@/app/components/ui/Tabs";
import { CreditAdjust } from "../CreditAdjust";
import { AccountSecurity } from "../_components/AccountSecurity";
import { useAccountAction } from "../_components/useAccountAction";
import { DataExport } from "../_components/DataExport";
import { AuditTimeline } from "../../audit/_components/AuditTimeline";
import { ContentBrowser } from "../../_components/ContentBrowser";

interface Detail {
  user: {
    id: string; email: string; name: string | null;
    credits: number; monthlyCredits: number; role: string; createdAt: string;
    minutes: number; monthlyMinutes: number;
    lastLoginAt: string | null; suspendedAt: string | null; adminNotes: string | null;
    subscriptionEndsAt: string | null; nextRefillAt: string | null;
    emailVerifiedAt: string | null; twoFactorEnabled: boolean; deactivatedAt: string | null;
    subscriptionCancelledAt: string | null; trialEndsAt: string | null; hasRecurringSubscription: boolean;
    plan: { id: string; name: string; slug: string; kind: string } | null;
  };
  purchaseCount: number;
  purchases: Array<{ id: string; amountInPaise: number; credits: number; minutes?: number; status: string; createdAt: string; plan: { name: string; kind: string } | null }>;
  generations: Array<{ id: string; toolSlug: string; modelId: string | null; creditsCost: number; status: string; createdAt: string }>;
  generationTotals: { count: number; creditsConsumed: number };
  socialAccounts: Array<{ id: string; provider: string; status: string; username: string | null; displayName: string | null; followers: number | null; lastSyncedAt: string | null }>;
  affiliate: { code: string; status: string; commissionRate: number; totalEarned: number; totalPaid: number } | null;
  loginEvents: Array<{ ip: string | null; device: string | null; country: string | null; createdAt: string }>;
  hasActiveSession: boolean;
  activeSessionCount?: number;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [notesLoadedFor, setNotesLoadedFor] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refundTarget, setRefundTarget] = useState<Detail["purchases"][number] | null>(null);
  const [clawback, setClawback] = useState(true);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const act = useAccountAction(id, headers);

  // data === undefined: loading. data === null: 404 (not found). Otherwise the detail payload.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${id}/detail`, { headers: headers() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load user");
      return (await res.json()) as Detail;
    },
    enabled: !!token,
  });

  // Seed the notes textarea once per user, without clobbering an in-progress
  // edit on every background refetch.
  if (data && notesLoadedFor !== id) {
    setNotesLoadedFor(id);
    setNotes(data.user.adminNotes ?? "");
  }

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${id}/detail`, {
        method: "PATCH", headers: headers(), body: JSON.stringify({ adminNotes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (data === null) {
    return (
      <AdminShell title="User">
        <p className="text-sm text-fg-muted">User not found. <Link href="/admin/users" className="text-brand font-semibold">Back to users</Link></p>
      </AdminShell>
    );
  }
  if (isError) {
    return (
      <AdminShell title="User">
        <ErrorCard onRetry={refetch} />
      </AdminShell>
    );
  }
  if (isLoading || !data) {
    return (
      <AdminShell title="User">
        <div className="animate-pulse space-y-4"><div className="h-32 bg-surface-3 rounded-2xl" /><div className="h-64 bg-surface-3 rounded-2xl" /></div>
      </AdminShell>
    );
  }

  const d = data;
  const isAdmin = d.user.role === "ADMIN";
  const subActive = !!d.user.subscriptionEndsAt && new Date(d.user.subscriptionEndsAt) > new Date();

  const overview = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card shadow padding="md" className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Credits</p><p className="font-bold text-fg">{d.user.credits}</p></div>
          <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Clip Minutes</p><p className="font-bold text-fg">{d.user.minutes ?? 0}{d.user.monthlyMinutes ? <span className="text-xs font-normal text-fg-subtle"> / {d.user.monthlyMinutes} mo</span> : null}</p></div>
          <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Consumed (all time)</p><p className="font-bold text-fg">{d.generationTotals.creditsConsumed}</p></div>
          <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Devices signed in</p><p className="font-bold text-fg">{d.activeSessionCount ?? (d.hasActiveSession ? "1+" : 0)}</p></div>
          <div className="bg-surface-2 rounded-lg p-2.5 col-span-2">
            <p className="text-xs text-fg-subtle">Subscription</p>
            <p className="font-semibold text-fg">
              {d.user.plan ? `${d.user.plan.name} (${d.user.plan.kind})` : "No plan"}
              {subActive ? ` · until ${new Date(d.user.subscriptionEndsAt!).toLocaleDateString("en-IN")}` : " · inactive"}
            </p>
          </div>
        </div>
        <p className="text-xs text-fg-subtle">
          {d.user.role} · joined {new Date(d.user.createdAt).toLocaleDateString("en-IN")} · last login {dt(d.user.lastLoginAt)}
        </p>
      </Card>

      <Card shadow padding="md">
        <label htmlFor="admin-notes" className="text-sm font-bold text-fg mb-2 block">
          Admin notes <span className="text-[10px] font-normal text-fg-subtle">(internal only)</span>
        </label>
        <textarea
          id="admin-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          className="w-full text-sm bg-surface-2 border border-line rounded-xl p-3 resize-y text-fg"
          placeholder="Support history, warnings, context…"
        />
        <Button onClick={() => saveNotesMutation.mutate()} variant="primary" size="sm" className="mt-2" loading={saveNotesMutation.isPending}>
          {notesSaved ? "Saved ✓" : "Save notes"}
        </Button>
      </Card>

      <div className="space-y-5">
        <Card shadow padding="md">
          <p className="text-sm font-bold text-fg mb-2">Affiliate</p>
          {d.affiliate ? (
            <p className="text-sm text-fg-muted">
              <span className="font-mono text-xs">{d.affiliate.code}</span> · {d.affiliate.status} · {(d.affiliate.commissionRate * 100).toFixed(0)}%
              <br />earned ₹{d.affiliate.totalEarned.toFixed(0)} · paid ₹{d.affiliate.totalPaid.toFixed(0)}
            </p>
          ) : (
            <p className="text-sm text-fg-subtle">Not an affiliate.</p>
          )}
        </Card>
        <Card shadow padding="md">
          <p className="text-sm font-bold text-fg mb-2">Social accounts</p>
          {d.socialAccounts.length === 0 ? (
            <p className="text-sm text-fg-subtle">None connected.</p>
          ) : (
            <ul className="text-sm text-fg-muted space-y-1.5">
              {d.socialAccounts.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="capitalize">{s.provider} · {s.displayName ?? s.username ?? "—"}</span>
                  <span className={s.status === "active" ? "text-fg-subtle" : "text-warning font-semibold"}>
                    {s.followers != null ? `${s.followers.toLocaleString()} · ` : ""}{s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );

  const billing = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-2">Subscription</h2>
          <p className="text-sm text-fg">
            {d.user.plan ? `${d.user.plan.name} (${d.user.plan.kind})` : "No plan"}
            {subActive ? ` · access until ${new Date(d.user.subscriptionEndsAt!).toLocaleDateString("en-IN")}` : " · inactive"}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {d.user.hasRecurringSubscription && <StatusBadge tone="info">Auto-renewing mandate</StatusBadge>}
            {d.user.trialEndsAt && new Date(d.user.trialEndsAt) > new Date() && <StatusBadge tone="warning">In trial until {new Date(d.user.trialEndsAt).toLocaleDateString("en-IN")}</StatusBadge>}
            {d.user.subscriptionCancelledAt && <StatusBadge tone="neutral">Renewal cancelled {new Date(d.user.subscriptionCancelledAt).toLocaleDateString("en-IN")}</StatusBadge>}
          </div>
          <p className="text-xs text-fg-subtle mt-3">To change or remove the plan, use Edit on the Users list (it grants or clears the plan&apos;s credits).</p>
          {subActive && d.user.plan && !d.user.subscriptionCancelledAt && (
            <Button size="sm" variant="danger" className="mt-3" disabled={isAdmin} onClick={() => setConfirmCancel(true)}>Cancel renewal</Button>
          )}
        </Card>
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-2">Adjust balances</h2>
          <CreditAdjust userId={id} headers={headers} />
          <CreditAdjust meter="minutes" userId={id} headers={headers} />
        </Card>
      </div>

      <Card shadow padding="md">
        <p className="text-sm font-bold text-fg mb-3">Purchases (latest 20 of {d.purchaseCount})</p>
        {d.purchases.length === 0 ? (
          <p className="text-sm text-fg-subtle">No purchases.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {d.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-fg">{p.plan?.name ?? "—"}</td>
                    <td className="py-1.5 text-xs text-fg-subtle whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-fg-muted whitespace-nowrap">{p.minutes ? `+${p.minutes} min` : `+${p.credits} cr`}</td>
                    <td className="py-1.5 text-right font-semibold text-fg whitespace-nowrap">{inr(p.amountInPaise)}</td>
                    <td className={`py-1.5 text-right text-xs ${p.status === "refunded" ? "text-error font-semibold" : "text-fg-subtle"}`}>{p.status}</td>
                    <td className="py-1.5 pl-3 text-right">
                      {p.status !== "refunded" && (
                        <Button variant="link" className="text-error text-xs" onClick={() => { setClawback(true); setRefundTarget(p); }}>Refund…</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card shadow padding="md">
        <p className="text-sm font-bold text-fg mb-3">
          Credit ledger <span className="text-[10px] font-normal text-fg-subtle">({d.generationTotals.count} generations all time)</span>
        </p>
        {d.generations.length === 0 ? (
          <p className="text-sm text-fg-subtle">No generations.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {d.generations.map((g) => (
                  <tr key={g.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-fg">{g.toolSlug}{g.modelId ? ` · ${g.modelId}` : ""}</td>
                    <td className="py-1.5 text-xs text-fg-subtle whitespace-nowrap">{new Date(g.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-fg">−{g.creditsCost} cr</td>
                    <td className={`py-1.5 text-right text-xs ${g.status === "failed" ? "text-error" : g.status === "refunded" ? "text-warning" : "text-fg-subtle"}`}>{g.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  const danger = (
    <Card shadow padding="md">
      <h2 className="text-sm font-bold text-fg">Delete account</h2>
      <p className="text-xs text-fg-subtle mt-1 mb-3">
        Permanently deletes the account, its projects, clips and library, and their stored files; cancels any live Razorpay mandate; signs them out everywhere.
      </p>
      {isAdmin ? (
        <p className="text-sm text-warning">Admin accounts can&apos;t be deleted — demote the role first.</p>
      ) : d.purchaseCount > 0 ? (
        <p className="text-sm text-warning">
          {`This account has ${d.purchaseCount} purchase(s). Billing records must be kept, so it can't be deleted — suspend it instead.`}
        </p>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>Delete account…</Button>
      )}
    </Card>
  );

  return (
    <AdminShell title={d.user.name || d.user.email}>
      <Link href="/admin/users" className="text-xs font-semibold text-fg-subtle hover:text-fg">← All accounts</Link>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
        <p className="text-sm text-fg-muted break-all">{d.user.email}</p>
        {isAdmin && <StatusBadge tone="primary">Admin</StatusBadge>}
        {d.user.suspendedAt && <StatusBadge tone="error">Suspended</StatusBadge>}
        {d.user.deactivatedAt && <StatusBadge tone="warning">Deactivated</StatusBadge>}
        {!d.user.emailVerifiedAt && <StatusBadge tone="neutral">Email unverified</StatusBadge>}
        {d.user.twoFactorEnabled && <StatusBadge tone="info">2FA on</StatusBadge>}
      </div>

      <Tabs
        label="Account"
        items={[
          { id: "overview", label: "Overview", content: overview },
          { id: "security", label: "Security", content: <AccountSecurity user={d.user} loginEvents={d.loginEvents} headers={headers} /> },
          { id: "billing", label: "Billing", content: billing },
          { id: "content", label: "Content", content: <Card shadow padding="md"><ContentBrowser headers={headers} userId={id} /></Card> },
          {
            id: "activity",
            label: "Activity",
            content: (
              <Card shadow padding="md">
                <p className="text-xs text-fg-subtle mb-3">
                  Every audited action taken on this account — by admins and by the user themselves — newest first.{" "}
                  <Link href={`/admin/audit?targetId=${id}&range=all`} className="text-brand hover:underline">Open in Audit Log</Link>
                </p>
                <AuditTimeline
                  headers={headers}
                  params={`involving=${encodeURIComponent(id)}&from=2000-01-01T00:00:00.000Z`}
                  emptyText="No audited activity on this account yet."
                />
              </Card>
            ),
          },
          {
            id: "data",
            label: "Data",
            content: (
              <div className="space-y-5">
                <DataExport userId={id} email={d.user.email} headers={headers} />
                {danger}
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel renewal"
        message={`Stop ${d.user.email}'s subscription from renewing? They keep access until the current period ends${d.user.trialEndsAt && new Date(d.user.trialEndsAt) > new Date() ? " (a trial is cancelled outright, so they are never charged)" : ""}, and get the usual cancellation email.`}
        confirmLabel="Cancel renewal"
        danger
        confirmPhrase={d.user.email}
        requireReason
        onConfirm={async ({ phrase, reason }) => {
          await act(`/api/admin/users/${id}/actions`, { action: "cancel_subscription", confirmPhrase: phrase, reason }, "Renewal cancelled");
        }}
        onClose={() => setConfirmCancel(false)}
      />
      <ConfirmDialog
        open={!!refundTarget}
        title="Record a refund"
        message={refundTarget ? `Mark the ${inr(refundTarget.amountInPaise)} ${refundTarget.plan?.name ?? ""} purchase as refunded. Send the money back in the Razorpay dashboard — this records it here.` : ""}
        confirmLabel="Record refund"
        danger
        requireReason
        onConfirm={async ({ reason }) => {
          if (!refundTarget) return;
          const ok = await act(`/api/admin/purchases/${refundTarget.id}/refund`, { reason, clawbackCredits: clawback }, "Refund recorded");
          if (ok) setRefundTarget(null);
        }}
        onClose={() => setRefundTarget(null)}
      >
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={clawback} onChange={(e) => setClawback(e.target.checked)} />
          Take back the credits this purchase granted
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete account"
        message={`Permanently delete ${d.user.email} and everything they made, including stored files? This cannot be undone.`}
        confirmLabel="Delete account"
        danger
        confirmPhrase={d.user.email}
        requireReason
        onConfirm={async ({ phrase, reason }) => {
          const ok = await act(`/api/admin/users/${id}/actions`, { action: "hard_delete", confirmPhrase: phrase, reason }, "Account deleted");
          if (ok) router.push("/admin/users");
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </AdminShell>
  );
}
