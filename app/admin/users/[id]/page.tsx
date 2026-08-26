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

// Audited credit correction — grant or deduct with a mandatory reason.
function CreditAdjust({ userId, headers }: { userId: string; headers: () => Record<string, string> }) {
  const queryClient = useQueryClient();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const n = parseInt(delta, 10);
      if (!Number.isInteger(n) || n === 0) throw new Error("Enter a non-zero integer (negative to deduct).");
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST", headers: headers(), body: JSON.stringify({ delta: n, reason: reason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.issues?.[0]?.message ?? d.error ?? "Failed");
      return d as { balance: number };
    },
    onSuccess: (d) => {
      setMsg(`Done — balance is now ${d.balance}.`);
      setDelta("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <div className="pt-2 border-t border-gray-50">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">Adjust credits (audited)</p>
      <div className="flex gap-1.5">
        <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±100" inputMode="numeric"
          className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Credit delta" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Reason" />
        <button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending || reason.trim().length < 3}
          className="text-xs font-semibold text-white bg-gray-900 px-3 py-1.5 rounded-lg disabled:opacity-50 cursor-pointer">
          Apply
        </button>
      </div>
      {msg && <p className="text-[11px] text-gray-500 mt-1">{msg}</p>}
    </div>
  );
}

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
        <p className="text-sm text-gray-500">User not found. <Link href="/admin/users" className="text-blue-600 font-semibold">Back to users</Link></p>
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
        <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-100 rounded-2xl" /><div className="h-64 bg-gray-100 rounded-2xl" /></div>
      </AdminShell>
    );
  }

  const d = data;
  const suspended = !!d.user.suspendedAt;
  const subActive = !!d.user.subscriptionEndsAt && new Date(d.user.subscriptionEndsAt) > new Date();

  return (
    <AdminShell title={d.user.name || d.user.email}>
      <Link href="/admin/users" className="text-xs font-semibold text-gray-400 hover:text-gray-700">← All users</Link>

      {suspended && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-lg px-4 py-2 my-3">
          Suspended since {dt(d.user.suspendedAt)} — login is blocked.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
        {/* Profile + moderation */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div>
            <p className="font-bold text-gray-900">{d.user.name ?? d.user.firstName ?? "—"}</p>
            <p className="text-sm text-gray-500">{d.user.email}</p>
            <p className="text-xs text-gray-400 mt-1">
              {d.user.role} · joined {new Date(d.user.createdAt).toLocaleDateString("en-IN")} · last login {dt(d.user.lastLoginAt)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-400">Credits</p><p className="font-bold text-gray-900">{d.user.credits}</p></div>
            <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-400">Consumed (all time)</p><p className="font-bold text-gray-900">{d.generationTotals.creditsConsumed}</p></div>
            <div className="bg-gray-50 rounded-lg p-2.5 col-span-2">
              <p className="text-xs text-gray-400">Subscription</p>
              <p className="font-semibold text-gray-800">
                {d.user.plan ? `${d.user.plan.name} (${d.user.plan.kind})` : "No plan"}
                {subActive ? ` · until ${new Date(d.user.subscriptionEndsAt!).toLocaleDateString("en-IN")}` : " · inactive"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${d.hasActiveSession ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {d.hasActiveSession ? "Active session" : "No live session"}
            </span>
          </div>
          <CreditAdjust userId={id} headers={headers} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
            <button onClick={() => setConfirmRevoke(true)} className="text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">
              Revoke sessions
            </button>
            {suspended ? (
              <button onClick={() => moderateMutation.mutate("unsuspend")} className="text-xs font-semibold text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 cursor-pointer">
                Unsuspend
              </button>
            ) : (
              <button onClick={() => setConfirmSuspend(true)} className="text-xs font-semibold text-red-600 px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer">
                Suspend user
              </button>
            )}
          </div>
        </div>

        {/* Admin notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-2">Admin notes <span className="text-[10px] font-normal text-gray-400">(internal only)</span></p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full text-sm border border-gray-200 rounded-xl p-3 resize-y"
            placeholder="Support history, warnings, context…"
          />
          <button onClick={() => saveNotesMutation.mutate()} className="mt-2 text-xs font-semibold text-white bg-gray-900 px-4 py-1.5 rounded-lg cursor-pointer">
            {notesSaved ? "Saved ✓" : "Save notes"}
          </button>
        </div>

        {/* Affiliate + social */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800 mb-2">Affiliate</p>
            {d.affiliate ? (
              <p className="text-sm text-gray-600">
                <span className="font-mono text-xs">{d.affiliate.code}</span> · {d.affiliate.status} · {(d.affiliate.commissionRate * 100).toFixed(0)}%
                <br />earned ₹{d.affiliate.totalEarned.toFixed(0)} · paid ₹{d.affiliate.totalPaid.toFixed(0)}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Not an affiliate.</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800 mb-2">Social accounts</p>
            {d.socialAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">None connected.</p>
            ) : (
              <ul className="text-sm text-gray-600 space-y-1.5">
                {d.socialAccounts.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span className="capitalize">{s.provider} · {s.displayName ?? s.username ?? "—"}</span>
                    <span className={s.status === "active" ? "text-gray-400" : "text-amber-600 font-semibold"}>
                      {s.followers != null ? `${s.followers.toLocaleString()} · ` : ""}{s.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Purchases */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-3">Purchases (latest 20)</p>
          {d.purchases.length === 0 ? (
            <p className="text-sm text-gray-400">No purchases.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-gray-50 first:border-0">
                    <td className="py-1.5 text-gray-700">{p.plan?.name ?? "—"}</td>
                    <td className="py-1.5 text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-gray-500">+{p.credits} cr</td>
                    <td className="py-1.5 text-right font-semibold text-gray-800">{inr(p.amountInPaise)}</td>
                    <td className={`py-1.5 text-right text-xs ${p.status === "refunded" ? "text-red-600 font-semibold" : "text-gray-400"}`}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Credit ledger */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-800 mb-3">
            Credit ledger <span className="text-[10px] font-normal text-gray-400">({d.generationTotals.count} generations all time)</span>
          </p>
          {d.generations.length === 0 ? (
            <p className="text-sm text-gray-400">No generations.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.generations.map((g) => (
                  <tr key={g.id} className="border-t border-gray-50 first:border-0">
                    <td className="py-1.5 text-gray-700">{g.toolSlug}{g.modelId ? ` · ${g.modelId}` : ""}</td>
                    <td className="py-1.5 text-xs text-gray-400">{new Date(g.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-1.5 text-right text-gray-700">−{g.creditsCost} cr</td>
                    <td className={`py-1.5 text-right text-xs ${g.status === "failed" ? "text-red-600" : g.status === "refunded" ? "text-amber-600" : "text-gray-400"}`}>{g.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Login history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <p className="text-sm font-bold text-gray-800 mb-3">Login history (latest 15)</p>
        {d.loginEvents.length === 0 ? (
          <p className="text-sm text-gray-400">No logins recorded yet — history accrues from the next sign-in.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-semibold pb-2">When</th>
                <th className="font-semibold pb-2">Device</th>
                <th className="font-semibold pb-2">Country</th>
                <th className="font-semibold pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {d.loginEvents.map((e, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-700">{dt(e.createdAt)}</td>
                  <td className="py-1.5 text-gray-500">{e.device ?? "—"}</td>
                  <td className="py-1.5 text-gray-500">{e.country ?? "—"}</td>
                  <td className="py-1.5 text-gray-400 font-mono text-xs">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
