"use client";
import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { CreditAdjust } from "./CreditAdjust";
import { buildUserPatchBody, toDateInputValue } from "./patch-body";

interface PlanRef {
  id: string;
  name: string;
  slug: string;
  kind: string;
  active: boolean;
  priceInPaise: number;
  credits: number;
  monthlyCredits: number | null;
  intervalMonths: number | null;
  tier: string | null;
}
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  monthlyCredits: number;
  role: "USER" | "ADMIN";
  createdAt: string;
  subscriptionEndsAt: string | null;
  nextRefillAt: string | null;
  plan: PlanRef | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  _count: { projects: number };
}

const FILTERS = [
  ["", "All accounts"],
  ["subscribed", "Subscribed"],
  ["suspended", "Suspended"],
  ["deactivated", "Deactivated"],
  ["unverified", "Email unverified"],
  ["2fa", "Two-factor on"],
  ["admins", "Admins"],
] as const;

type BulkAction = "suspend" | "unsuspend" | "revoke_sessions";
const BULK_LABEL: Record<BulkAction, string> = { suspend: "Suspend", unsuspend: "Unsuspend", revoke_sessions: "Sign out everywhere" };

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function isExpired(iso: string | null) {
  return iso ? new Date(iso) <= new Date() : true;
}

const LIMIT = 50;

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/** Price and credits in the option itself — picking "Studio (Yearly)" blind was
 *  how a ₹40,192-equivalent entitlement got granted by a stray arrow key. */
function planOptionLabel(p: PlanRef): string {
  const credits = p.kind === "subscription" && p.monthlyCredits
    ? `${p.monthlyCredits} cr/mo`
    : `${p.credits} cr`;
  return `${p.name} — ${inr(p.priceInPaise)} · ${credits}${p.active ? "" : " · INACTIVE"}`;
}

/** Spells out the consequences the admin is about to accept. */
function planChangePreview(user: AdminUser | null, plan: PlanRef | null): string {
  const who = user?.email ?? "this user";
  if (!plan) {
    return `Remove ${who}'s plan. Their subscription is cancelled at Razorpay, subscription credits are zeroed (purchased and bonus credits survive), and they rejoin the free tier's monthly credit drip.`;
  }
  if (plan.kind !== "subscription") {
    return `Grant ${who} the ${plan.credits} credits from "${plan.name}". This is a one-off credit grant into the never-expiring purchased bucket — it does NOT give them a plan, a tier, or any entitlement.`;
  }
  const months = plan.intervalMonths ?? 1;
  return `Put ${who} on "${plan.name}". They get ${plan.monthlyCredits ?? plan.credits} credits now, a ${months}-month term starting today, and the ${plan.tier ?? "—"} tier's entitlements${months > 1 ? ", with monthly refills for the rest of the term" : ""}. No payment is taken.`;
}


export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  // Expanded action row
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [editSubEnd, setEditSubEnd]       = useState("");
  const [editMonthly, setEditMonthly]     = useState("");
  const [editName, setEditName]           = useState("");
  const [editEmail, setEditEmail]         = useState("");

  // Which inputs the admin has actually typed in, this expansion.
  //
  // Save used to decide what to send by diffing the edit buffer against the
  // row — but the row can change underneath an open editor. Applying a plan
  // refetches the list, so `u.subscriptionEndsAt` became a future date while
  // `editSubEnd` still held the pre-change value; the diff then read as an
  // edit and Save sent `subscriptionEndsAt: null`, clearing the term the plan
  // had just set while leaving planId in place. That is the exact state where
  // the admin panel shows a plan and the user's dashboard shows Free.
  //
  // A field is now sent only if it was genuinely edited, so a stale buffer can
  // no longer overwrite a column nobody touched.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (field: string) =>
    setTouched(prev => (prev.has(field) ? prev : new Set(prev).add(field)));

  // Staged plan change. The picker used to PATCH straight from onChange, so
  // there was no confirmation on an action that grants credits and starts a
  // billing term — and arrow-keying through the options fired one PATCH per
  // option passed. Now a selection is only staged; applying it is a separate,
  // explicit, reasoned step.
  const [planChange, setPlanChange] = useState<{ userId: string; planId: string | null } | null>(null);
  const [planConfirmOpen, setPlanConfirmOpen] = useState(false);
  const [planReason, setPlanReason] = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Granting ADMIN mints a second full admin — confirm before it fires, same
  // as delete. Demoting back to USER doesn't need this (reversible).
  const [confirmPromoteId, setConfirmPromoteId] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-users", page, search, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ search, filter, page: String(page), limit: String(LIMIT) });
      const [u, p] = await Promise.all([
        fetch(`/api/admin/users?${params}`, { headers: headers() }),
        fetch("/api/admin/plans", { headers: headers() }),
      ]);
      if (!u.ok) throw new Error("Failed to load users");
      const uData = (await u.json()) as { users?: AdminUser[]; total?: number };
      const pData = p.ok ? ((await p.json()) as { plans?: PlanRef[] }) : { plans: [] };
      return { users: uData.users ?? [], total: uData.total ?? 0, plans: pData.plans ?? [] };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Update failed");
      return d as { user: Partial<AdminUser> };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, confirmPhrase, reason }: { id: string; confirmPhrase: string; reason: string }) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: headers(), body: JSON.stringify({ confirmPhrase, reason }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to delete user.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("User deleted", "success");
      setDeleteConfirmId(null);
    },
    onError: (e: Error) => { showToast(e.message, "error"); setDeleteConfirmId(null); },
  });

  async function runBulk(action: BulkAction, phrase: string, reason: string) {
    const res = await fetch("/api/admin/users/bulk", {
      method: "POST", headers: headers(), body: JSON.stringify({ ids: [...selected], action, confirmPhrase: phrase, reason }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(d.error ?? "Bulk action failed", "error"); return; }
    showToast(`${BULK_LABEL[action]}: ${d.affected} account(s)${d.skipped ? `, ${d.skipped} skipped (admins / you)` : ""}`, "success");
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seedEditBuffer(u: AdminUser) {
    setEditMonthly(String(u.monthlyCredits));
    setEditSubEnd(toDateInputValue(u.subscriptionEndsAt));
    setEditName(u.name ?? "");
    setEditEmail(u.email);
    setTouched(new Set());
  }

  function openExpand(u: AdminUser) {
    if (expandedId === u.id) { setExpandedId(null); return; }
    setExpandedId(u.id);
    seedEditBuffer(u);
  }

  function saveExpanded(u: AdminUser) {
    // The rule lives in ./patch-body so it can be tested without mounting this
    // page — see patch-body.test.ts for why it exists.
    const body = buildUserPatchBody(
      {
        monthlyCredits: u.monthlyCredits,
        subscriptionEndsAt: u.subscriptionEndsAt,
        name: u.name,
        email: u.email,
      },
      { monthlyCredits: editMonthly, subscriptionEndsAt: editSubEnd, name: editName, email: editEmail },
      touched,
    );
    if (Object.keys(body).length > 0) patchMutation.mutate({ id: u.id, body });
    setExpandedId(null);
  }

  const users = data?.users ?? [];
  const plans = data?.plans ?? [];

  // Applying a plan refetches the list, so an open editor's inputs would keep
  // showing the pre-change values — the admin sets a plan, sees "Sub Ends At"
  // still blank, and reasonably assumes it didn't work. Re-seed untouched
  // fields when the underlying row changes; anything the admin has typed in is
  // left alone so a background refetch can't discard their input.
  const expandedRow = users.find(u => u.id === expandedId);
  const expandedSubEnd = expandedRow?.subscriptionEndsAt ?? null;
  const expandedMonthly = expandedRow?.monthlyCredits ?? null;
  useEffect(() => {
    if (!expandedRow) return;
    if (!touched.has("subscriptionEndsAt")) {
      setEditSubEnd(toDateInputValue(expandedSubEnd));
    }
    if (!touched.has("monthlyCredits") && expandedMonthly !== null) {
      setEditMonthly(String(expandedMonthly));
    }
    // Keyed on the row's own values, not the object identity, so a refetch
    // that changed nothing doesn't churn state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId, expandedSubEnd, expandedMonthly]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const inputCls = "bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <AdminShell title="Accounts">
      {/* Search + pagination controls */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setPage(1); setSelected(new Set()); }}
            placeholder="Search by email or name…"
            aria-label="Search users"
            className="w-72 max-w-full bg-panel border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
          />
          <select
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1); setSelected(new Set()); }}
            aria-label="Filter users"
            className="bg-panel border border-line rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <span className="text-sm text-fg-subtle">{total} user{total !== 1 ? "s" : ""}</span>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading users…</p>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5">
              <span className="text-sm font-semibold text-fg mr-2">{selected.size} selected</span>
              {(Object.keys(BULK_LABEL) as BulkAction[]).map((a) => (
                <Button key={a} size="sm" variant={a === "suspend" ? "danger" : "secondary"} onClick={() => setBulk(a)}>{BULK_LABEL[a]}</Button>
              ))}
              <Button size="sm" variant="link" className="text-fg-muted ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          <Card shadow className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    <th className="py-3.5 pl-5 pr-1 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select every user on this page"
                        checked={users.length > 0 && users.every(u => selected.has(u.id))}
                        onChange={e => setSelected(e.target.checked ? new Set(users.map(u => u.id)) : new Set())}
                      />
                    </th>
                    <th className="py-3.5 px-3">User</th>
                    <th className="py-3.5 px-3">Credits</th>
                    <th className="py-3.5 px-3">Mo. Credits</th>
                    <th className="py-3.5 px-3">Plan</th>
                    <th className="py-3.5 px-3">Sub Expires</th>
                    <th className="py-3.5 px-3">Role</th>
                    <th className="py-3.5 px-3">Videos</th>
                    <th className="py-3.5 px-3">Joined</th>
                    <th className="py-3.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const subExpired = isExpired(u.subscriptionEndsAt);
                    const isAdmin = u.role === "ADMIN";
                    const savingThis = patchMutation.isPending && patchMutation.variables?.id === u.id;
                    return (
                      <Fragment key={u.id}>
                        <tr
                          className={`border-b border-line last:border-0 transition-colors ${isAdmin ? "bg-tint-blue/40" : ""}`}>
                          <td className="py-3 pl-5 pr-1">
                            <input type="checkbox" aria-label={`Select ${u.email}`} checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-fg">{u.name || u.email}</p>
                            {u.name && <p className="text-xs text-fg-subtle">{u.email}</p>}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {isAdmin && <StatusBadge tone="primary">Admin</StatusBadge>}
                              {u.suspendedAt && <StatusBadge tone="error">Suspended</StatusBadge>}
                              {u.deactivatedAt && <StatusBadge tone="warning">Deactivated</StatusBadge>}
                              {!u.emailVerifiedAt && <StatusBadge tone="neutral">Unverified</StatusBadge>}
                              {u.twoFactorEnabled && <StatusBadge tone="info">2FA</StatusBadge>}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-fg">{u.credits}</td>
                          <td className="py-3 px-3 text-fg-muted">{u.monthlyCredits > 0 ? u.monthlyCredits : "—"}</td>
                          {/* Showed `plan.name` with no expiry check, so an account whose
                              subscription term was missing or past looked identical to a
                              paying one — the admin had no way to see that the user's own
                              dashboard was saying "Free". Follows the user-detail page's
                              existing "· inactive" convention. */}
                          <td className="py-3 px-3 text-xs">
                            {u.plan?.name ? (
                              <span className={subExpired ? "text-fg-subtle" : "text-fg-muted"}>
                                {u.plan.name}
                                {subExpired && (
                                  <span className="ml-1.5 text-[10px] font-bold text-warning bg-warning/15 px-1.5 py-0.5 rounded-full align-middle">
                                    inactive
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-fg-muted">Free</span>
                            )}
                          </td>
                          <td className={`py-3 px-3 text-xs ${subExpired ? "text-fg-subtle" : "text-fg-muted"}`}>
                            {fmtDate(u.subscriptionEndsAt)}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={u.role}
                              onChange={e => e.target.value === "ADMIN" ? setConfirmPromoteId(u.id) : patchMutation.mutate({ id: u.id, body: { role: e.target.value } })}
                              disabled={savingThis}
                              className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${isAdmin ? "border-brand/40 text-brand bg-tint-blue" : "border-line text-fg-muted bg-panel"}`}
                            >
                              <option value="USER">User</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </td>
                          <td className="py-3 px-3 text-fg-muted">{u._count.projects}</td>
                          <td className="py-3 px-3 text-fg-subtle text-xs whitespace-nowrap">{fmt(u.createdAt)}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <Button href={`/admin/users/${u.id}`} variant="secondary" size="sm">
                                View
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => openExpand(u)} className="!text-brand !border-brand/40 hover:!bg-tint-blue">
                                {expandedId === u.id ? "Close" : "Edit"}
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => setDeleteConfirmId(u.id)}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === u.id && (
                          <tr key={`${u.id}-expand`} className="bg-tint-blue/60 border-b border-line">
                            <td colSpan={10} className="px-5 py-4">
                              <div className="flex flex-wrap items-end gap-4">
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1">Display Name</label>
                                  <input type="text" className={inputCls} value={editName} onChange={e => { setEditName(e.target.value); markTouched("name"); }} placeholder="e.g. John Doe" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1">Email</label>
                                  <input type="email" className={inputCls} value={editEmail} onChange={e => { setEditEmail(e.target.value); markTouched("email"); }} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1">Credits</label>
                                  <p className="text-sm font-bold text-fg px-2.5 py-1.5">{u.credits}</p>
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1">Monthly Credits</label>
                                  <input type="number" className={inputCls} value={editMonthly} onChange={e => { setEditMonthly(e.target.value); markTouched("monthlyCredits"); }} min={0} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1">Sub Ends At</label>
                                  <input type="date" className={inputCls} value={editSubEnd} onChange={e => { setEditSubEnd(e.target.value); markTouched("subscriptionEndsAt"); }} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-fg-subtle block mb-1" htmlFor={`plan-${u.id}`}>Assign Plan</label>
                                  <select
                                    id={`plan-${u.id}`}
                                    value={planChange?.userId === u.id ? (planChange.planId ?? "") : (u.plan?.id ?? "")}
                                    onChange={e => { setPlanChange({ userId: u.id, planId: e.target.value || null }); setPlanReason(""); }}
                                    disabled={savingThis}
                                    className={inputCls}
                                  >
                                    <option value="">Free (no plan)</option>
                                    <optgroup label="Subscriptions">
                                      {plans.filter(p => p.kind === "subscription").map(p => (
                                        <option key={p.id} value={p.id}>{planOptionLabel(p)}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="Credit packs (grants credits only)">
                                      {plans.filter(p => p.kind !== "subscription").map(p => (
                                        <option key={p.id} value={p.id}>{planOptionLabel(p)}</option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </div>
                                <div className="flex gap-2 pb-0.5">
                                  {planChange?.userId === u.id && (planChange.planId ?? null) !== (u.plan?.id ?? null) && (
                                    <Button variant="secondary" size="sm" onClick={() => setPlanConfirmOpen(true)} disabled={savingThis}>
                                      Apply plan change…
                                    </Button>
                                  )}
                                  <Button variant="primary" size="sm" onClick={() => saveExpanded(u)} disabled={savingThis}>
                                    {savingThis ? "Saving…" : "Save"}
                                  </Button>
                                  <Button variant="secondary" size="sm" onClick={() => setExpandedId(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 max-w-md">
                                <CreditAdjust userId={u.id} headers={headers} invalidateKeys={[["admin-users"]]} />
                                <CreditAdjust meter="minutes" userId={u.id} headers={headers} invalidateKeys={[["admin-users"]]} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-fg-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                ← Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmPromoteId !== null}
        title="Grant admin access"
        message={`Make "${users.find(u => u.id === confirmPromoteId)?.email ?? ""}" a full admin? They'll get access to every page and action in this console.`}
        confirmLabel="Grant admin"
        danger
        onConfirm={async () => {
          if (!confirmPromoteId) return;
          await patchMutation.mutateAsync({ id: confirmPromoteId, body: { role: "ADMIN", confirm: true } });
          showToast("Admin access granted", "success");
        }}
        onClose={() => setConfirmPromoteId(null)}
      />
      <ConfirmDialog
        open={planConfirmOpen && planChange !== null}
        title="Change this user's plan"
        message={planChangePreview(
          users.find(u => u.id === planChange?.userId) ?? null,
          plans.find(p => p.id === planChange?.planId) ?? null,
        )}
        confirmLabel="Apply plan change"
        confirmDisabled={planReason.trim().length < 3}
        danger={planChange?.planId == null}
        onConfirm={async () => {
          if (!planChange) return;
          await patchMutation.mutateAsync({
            id: planChange.userId,
            body: { planId: planChange.planId, reason: planReason.trim() },
          });
          setPlanChange(null);
          setPlanReason("");
        }}
        onClose={() => setPlanConfirmOpen(false)}
      >
        <input
          value={planReason}
          onChange={(e) => setPlanReason(e.target.value)}
          placeholder="Reason (required, recorded in the audit log)"
          aria-label="Reason for the plan change"
          className="w-full text-xs border border-line rounded-lg px-2.5 py-2"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Delete user"
        message={`Permanently delete "${users.find(u => u.id === deleteConfirmId)?.email ?? ""}" — the account, their projects, clips and library, including the stored files? Accounts with billing history are refused. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        confirmPhrase={users.find(u => u.id === deleteConfirmId)?.email}
        requireReason
        onConfirm={async ({ phrase, reason }) => {
          if (deleteConfirmId) await deleteMutation.mutateAsync({ id: deleteConfirmId, confirmPhrase: phrase, reason }).catch(() => {});
        }}
        onClose={() => setDeleteConfirmId(null)}
      />
      <ConfirmDialog
        open={bulk !== null}
        title={bulk ? `${BULK_LABEL[bulk]}: ${selected.size} account(s)` : ""}
        message={
          bulk === "suspend"
            ? "Block sign-in for every selected account and sign them out now. Admin accounts (and yours) are skipped."
            : bulk === "unsuspend"
              ? "Let every selected account sign in again."
              : "Sign every selected account out of all devices. They can sign straight back in."
        }
        confirmLabel={bulk ? BULK_LABEL[bulk] : ""}
        danger={bulk === "suspend"}
        confirmPhrase={`${selected.size} users`}
        requireReason
        onConfirm={({ phrase, reason }) => (bulk ? runBulk(bulk, phrase, reason) : undefined)}
        onClose={() => setBulk(null)}
      />
    </AdminShell>
  );
}
