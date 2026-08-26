"use client";
import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";

interface PlanRef { id: string; name: string; slug: string }
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
  _count: { projects: number };
}

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

export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);

  // Expanded action row
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [editCredits, setEditCredits]     = useState("");
  const [editSubEnd, setEditSubEnd]       = useState("");
  const [editMonthly, setEditMonthly]     = useState("");
  const [editName, setEditName]           = useState("");
  const [editEmail, setEditEmail]         = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Granting ADMIN mints a second full admin — confirm before it fires, same
  // as delete. Demoting back to USER doesn't need this (reversible).
  const [confirmPromoteId, setConfirmPromoteId] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ search, page: String(page), limit: String(LIMIT) });
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
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to delete user.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("User deleted", "success");
      setDeleteConfirmId(null);
    },
    onError: (e: Error) => { showToast(e.message, "error"); setDeleteConfirmId(null); },
  });

  function openExpand(u: AdminUser) {
    if (expandedId === u.id) { setExpandedId(null); return; }
    setExpandedId(u.id);
    setEditCredits(String(u.credits));
    setEditMonthly(String(u.monthlyCredits));
    setEditSubEnd(u.subscriptionEndsAt ? u.subscriptionEndsAt.split("T")[0] : "");
    setEditName(u.name ?? "");
    setEditEmail(u.email);
  }

  function saveExpanded(u: AdminUser) {
    const body: Record<string, unknown> = {};
    const cr = parseInt(editCredits, 10);
    if (!isNaN(cr) && cr !== u.credits) body.credits = cr;
    const mc = parseInt(editMonthly, 10);
    if (!isNaN(mc) && mc !== u.monthlyCredits) body.monthlyCredits = mc;
    if (editSubEnd !== (u.subscriptionEndsAt ? u.subscriptionEndsAt.split("T")[0] : "")) {
      body.subscriptionEndsAt = editSubEnd || null;
    }
    const trimName = editName.trim();
    if (trimName !== (u.name ?? "")) body.name = trimName;
    const trimEmail = editEmail.trim().toLowerCase();
    if (trimEmail && trimEmail !== u.email) body.email = trimEmail;
    if (Object.keys(body).length > 0) patchMutation.mutate({ id: u.id, body });
    setExpandedId(null);
  }

  const users = data?.users ?? [];
  const plans = data?.plans ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const inputCls = "bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AdminShell title="Users">
      {/* Search + pagination controls */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <input
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); setPage(1); }}
          placeholder="Search by email or name…"
          className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <span className="text-sm text-gray-400">{total} user{total !== 1 ? "s" : ""}</span>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading users…</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="py-3.5 px-5">User</th>
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
                          className={`border-b border-gray-50 last:border-0 transition-colors ${isAdmin ? "bg-blue-50/40" : ""}`}>
                          <td className="py-3 px-5">
                            <p className="font-semibold text-gray-900">{u.name || u.email}</p>
                            {u.name && <p className="text-xs text-gray-400">{u.email}</p>}
                            {isAdmin && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">ADMIN</span>}
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-900">{u.credits}</td>
                          <td className="py-3 px-3 text-gray-500">{u.monthlyCredits > 0 ? u.monthlyCredits : "—"}</td>
                          <td className="py-3 px-3 text-gray-600 text-xs">{u.plan?.name ?? "Free"}</td>
                          <td className={`py-3 px-3 text-xs ${subExpired ? "text-gray-300" : "text-gray-600"}`}>
                            {fmtDate(u.subscriptionEndsAt)}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={u.role}
                              onChange={e => e.target.value === "ADMIN" ? setConfirmPromoteId(u.id) : patchMutation.mutate({ id: u.id, body: { role: e.target.value } })}
                              disabled={savingThis}
                              className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAdmin ? "border-blue-200 text-blue-700 bg-blue-50" : "border-gray-200 text-gray-600 bg-white"}`}
                            >
                              <option value="USER">User</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </td>
                          <td className="py-3 px-3 text-gray-600">{u._count.projects}</td>
                          <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(u.createdAt)}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`/admin/users/${u.id}`}
                                className="text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
                                View
                              </a>
                              <button
                                onClick={() => openExpand(u)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors">
                                {expandedId === u.id ? "Close" : "Edit"}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(u.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 transition-colors">
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === u.id && (
                          <tr key={`${u.id}-expand`} className="bg-blue-50/60 border-b border-blue-100">
                            <td colSpan={9} className="px-5 py-4">
                              <div className="flex flex-wrap items-end gap-4">
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Display Name</label>
                                  <input type="text" className={inputCls} value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. John Doe" />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Email</label>
                                  <input type="email" className={inputCls} value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Set Credits</label>
                                  <input type="number" className={inputCls} value={editCredits} onChange={e => setEditCredits(e.target.value)} min={0} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Monthly Credits</label>
                                  <input type="number" className={inputCls} value={editMonthly} onChange={e => setEditMonthly(e.target.value)} min={0} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Sub Ends At</label>
                                  <input type="date" className={inputCls} value={editSubEnd} onChange={e => setEditSubEnd(e.target.value)} />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Assign Plan</label>
                                  <select
                                    value={u.plan?.id ?? ""}
                                    onChange={e => patchMutation.mutate({ id: u.id, body: { planId: e.target.value || null } })}
                                    disabled={savingThis}
                                    className={inputCls}
                                  >
                                    <option value="">Free</option>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                </div>
                                <div className="flex gap-2 pb-0.5">
                                  <button
                                    onClick={() => saveExpanded(u)}
                                    disabled={savingThis}
                                    className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-1.5 rounded-lg transition-colors">
                                    {savingThis ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => setExpandedId(null)}
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                    Cancel
                                  </button>
                                </div>
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
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                ← Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Next →
              </button>
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
        open={deleteConfirmId !== null}
        title="Delete user"
        message={`Permanently delete "${users.find(u => u.id === deleteConfirmId)?.email ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => { if (deleteConfirmId) await deleteMutation.mutateAsync(deleteConfirmId); }}
        onClose={() => setDeleteConfirmId(null)}
      />
    </AdminShell>
  );
}
