"use client";

// Single-user operations view: profile + subscription, moderation actions
// (suspend / revoke sessions), admin notes, purchases, credit ledger, social
// accounts, affiliate state, and login history — everything in one place.

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { CreditAdjust } from "../CreditAdjust";

interface Detail {
  user: {
    id: string; email: string; name: string | null; firstName: string | null;
    credits: number; monthlyCredits: number; role: string; createdAt: string;
    lastLoginAt: string | null; suspendedAt: string | null; adminNotes: string | null;
    subscriptionEndsAt: string | null; nextRefillAt: string | null;
    plan: { id: string; name: string; slug: string; kind: string } | null;
  };
  purchases: Array<{ id: string; amountInPaise: number; credits: number; status: string; createdAt: string; plan: { name: string; kind: string } | null }>;
  generations: Array<{ id: string; toolSlug: string; modelId: string | null; creditsCost: number; status: string; createdAt: string }>;
  generationTotals: { count: number; creditsConsumed: number };
  socialAccounts: Array<{ id: string; provider: string; status: string; username: string | null; displayName: string | null; followers: number | null; lastSyncedAt: string | null }>;
  affiliate: { code: string; status: string; commissionRate: number; totalEarned: number; totalPaid: number } | null;
  loginEvents: Array<{ ip: string | null; device: string | null; country: string | null; createdAt: string }>;
  hasActiveSession: boolean;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [notesLoadedFor, setNotesLoadedFor] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

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

  const moderateMutation = useMutation({
    mutationFn: async (action: "suspend" | "unsuspend" | "revoke_sessions") => {
      const res = await fetch(`/api/admin/users/${id}/moderate`, {
        method: "POST", headers: headers(), body: JSON.stringify({ action, confirm: action !== "unsuspend" ? true : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Action failed");
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] });
      showToast(action === "revoke_sessions" ? "Sessions revoked." : action === "suspend" ? "User suspended and sessions revoked." : "User unsuspended.", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

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
  const suspended = !!d.user.suspendedAt;
  const subActive = !!d.user.subscriptionEndsAt && new Date(d.user.subscriptionEndsAt) > new Date();

  return (
    <AdminShell title={d.user.name || d.user.email}>
      <Link href="/admin/users" className="text-xs font-semibold text-fg-subtle hover:text-fg">← All users</Link>

      {suspended && (
        <p className="text-sm text-red-800 bg-error/10 border border-red-100 rounded-lg px-4 py-2 my-3">
          Suspended since {dt(d.user.suspendedAt)} — login is blocked.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
        {/* Profile + moderation */}
        <Card shadow padding="md" className="space-y-3">
          <div>
            <p className="font-bold text-fg">{d.user.name ?? d.user.firstName ?? "—"}</p>
            <p className="text-sm text-fg-muted">{d.user.email}</p>
            <p className="text-xs text-fg-subtle mt-1">
              {d.user.role} · joined {new Date(d.user.createdAt).toLocaleDateString("en-IN")} · last login {dt(d.user.lastLoginAt)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Credits</p><p className="font-bold text-fg">{d.user.credits}</p></div>
            <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-xs text-fg-subtle">Consumed (all time)</p><p className="font-bold text-fg">{d.generationTotals.creditsConsumed}</p></div>
            <div className="bg-surface-2 rounded-lg p-2.5 col-span-2">
              <p className="text-xs text-fg-subtle">Subscription</p>
              <p className="font-semibold text-fg">
                {d.user.plan ? `${d.user.plan.name} (${d.user.plan.kind})` : "No plan"}
                {subActive ? ` · until ${new Date(d.user.subscriptionEndsAt!).toLocaleDateString("en-IN")}` : " · inactive"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${d.hasActiveSession ? "bg-emerald-50 text-emerald-700" : "bg-surface-3 text-fg-muted"}`}>
              {d.hasActiveSession ? "Active session" : "No live session"}
            </span>
          </div>
          <CreditAdjust userId={id} headers={headers} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
            <Button onClick={() => setConfirmRevoke(true)} variant="secondary" size="sm">
              Revoke sessions
            </Button>
            {suspended ? (
              <Button onClick={() => moderateMutation.mutate("unsuspend")} variant="secondary" size="sm" className="!text-emerald-700 !border-emerald-200">
                Unsuspend
              </Button>
            ) : (
              <Button onClick={() => setConfirmSuspend(true)} variant="danger" size="sm">
                Suspend user
              </Button>
            )}
          </div>
        </Card>

        {/* Admin notes */}
        <Card shadow padding="md">
          <p className="text-sm font-bold text-fg mb-2">Admin notes <span className="text-[10px] font-normal text-fg-subtle">(internal only)</span></p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full text-sm border border-line rounded-xl p-3 resize-y"
            placeholder="Support history, warnings, context…"
          />
          <Button onClick={() => saveNotesMutation.mutate()} variant="primary" size="sm" className="mt-2">
            {notesSaved ? "Saved ✓" : "Save notes"}
          </Button>
        </Card>

        {/* Affiliate + social */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Purchases */}
        <Card shadow padding="md">
          <p className="text-sm font-bold text-fg mb-3">Purchases (latest 20)</p>
          {d.purchases.length === 0 ? (
            <p className="text-sm text-fg-subtle">No purchases.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-fg">{p.plan?.name ?? "—"}</td>
                    <td className="py-1.5 text-xs text-fg-subtle">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-fg-muted">+{p.credits} cr</td>
                    <td className="py-1.5 text-right font-semibold text-fg">{inr(p.amountInPaise)}</td>
                    <td className={`py-1.5 text-right text-xs ${p.status === "refunded" ? "text-error font-semibold" : "text-fg-subtle"}`}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Credit ledger */}
        <Card shadow padding="md">
          <p className="text-sm font-bold text-fg mb-3">
            Credit ledger <span className="text-[10px] font-normal text-fg-subtle">({d.generationTotals.count} generations all time)</span>
          </p>
          {d.generations.length === 0 ? (
            <p className="text-sm text-fg-subtle">No generations.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.generations.map((g) => (
                  <tr key={g.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-fg">{g.toolSlug}{g.modelId ? ` · ${g.modelId}` : ""}</td>
                    <td className="py-1.5 text-xs text-fg-subtle">{new Date(g.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-fg">−{g.creditsCost} cr</td>
                    <td className={`py-1.5 text-right text-xs ${g.status === "failed" ? "text-error" : g.status === "refunded" ? "text-warning" : "text-fg-subtle"}`}>{g.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Login history */}
      <Card shadow padding="md" className="mt-5">
        <p className="text-sm font-bold text-fg mb-3">Login history (latest 15)</p>
        {d.loginEvents.length === 0 ? (
          <p className="text-sm text-fg-subtle">No logins recorded yet — history accrues from the next sign-in.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                <th className="font-semibold pb-2">When</th>
                <th className="font-semibold pb-2">Device</th>
                <th className="font-semibold pb-2">Country</th>
                <th className="font-semibold pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {d.loginEvents.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 text-fg">{dt(e.createdAt)}</td>
                  <td className="py-1.5 text-fg-muted">{e.device ?? "—"}</td>
                  <td className="py-1.5 text-fg-muted">{e.country ?? "—"}</td>
                  <td className="py-1.5 text-fg-subtle font-mono text-xs">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ConfirmDialog
        open={confirmSuspend}
        title="Suspend user"
        message={`Suspend "${d.user.email}"? Their login is blocked immediately and their live session is revoked.`}
        confirmLabel="Suspend"
        danger
        onConfirm={async () => { await moderateMutation.mutateAsync("suspend"); }}
        onClose={() => setConfirmSuspend(false)}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke sessions"
        message={`Log "${d.user.email}" out of every active session? They'll need to sign in again.`}
        confirmLabel="Revoke"
        danger
        onConfirm={async () => { await moderateMutation.mutateAsync("revoke_sessions"); }}
        onClose={() => setConfirmRevoke(false)}
      />
    </AdminShell>
  );
}
