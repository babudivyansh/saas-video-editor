"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface PlanRef { id: string; name: string; slug: string }
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  monthlyCredits: number;
  role: "USER" | "ADMIN";
  createdAt: string;
  veo3Enabled: boolean;
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

export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [plans, setPlans]     = useState<PlanRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const LIMIT = 50;

  // Expanded action row
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [editCredits, setEditCredits]     = useState("");
  const [editSubEnd, setEditSubEnd]       = useState("");
  const [editMonthly, setEditMonthly]     = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, pg: number) => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const params = new URLSearchParams({ search: q, page: String(pg), limit: String(LIMIT) });
    const [u, p] = await Promise.all([
      fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { users: [], total: 0 }),
      fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { plans: [] }),
    ]);
    setUsers(u.users ?? []);
    setTotal(u.total ?? 0);
    setPlans(p.plans ?? []);
    setLoading(false);
  }, [token, user?.role]);

  useEffect(() => { load(search, page); }, [load, search, page]);

  function onSearch(q: string) {
    setSearch(q);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q, 1), 400);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { user: Partial<AdminUser> };
        setUsers(prev => prev.map(x => x.id === id ? { ...x, ...data.user } as AdminUser : x));
      }
    } finally {
      setSavingId(null);
    }
  }

  function openExpand(u: AdminUser) {
    if (expandedId === u.id) { setExpandedId(null); return; }
    setExpandedId(u.id);
    setEditCredits(String(u.credits));
    setEditMonthly(String(u.monthlyCredits));
    setEditSubEnd(u.subscriptionEndsAt ? u.subscriptionEndsAt.split("T")[0] : "");
  }

  async function saveExpanded(u: AdminUser) {
    const body: Record<string, unknown> = {};
    const cr = parseInt(editCredits, 10);
    if (!isNaN(cr) && cr !== u.credits) body.credits = cr;
    const mc = parseInt(editMonthly, 10);
    if (!isNaN(mc) && mc !== u.monthlyCredits) body.monthlyCredits = mc;
    if (editSubEnd !== (u.subscriptionEndsAt ? u.subscriptionEndsAt.split("T")[0] : "")) {
      body.subscriptionEndsAt = editSubEnd || null;
    }
    if (Object.keys(body).length > 0) await patch(u.id, body);
    setExpandedId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const inputCls = "bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AdminShell title="Users">
      {/* Search + pagination controls */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <span className="text-sm text-gray-400">{total} user{total !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
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
                    <th className="py-3.5 px-3">Veo3</th>
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
                    return (
                      <>
                        <tr key={u.id}
                          className={`border-b border-gray-50 last:border-0 transition-colors ${isAdmin ? "bg-blue-50/40" : ""}`}>
                          <td className="py-3 px-5">
                            <p className="font-semibold text-gray-900">{u.name || u.email}</p>
                            {u.name && <p className="text-xs text-gray-400">{u.email}</p>}
                            {isAdmin && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">ADMIN</span>}
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-900">{u.credits}</td>
                          <td className="py-3 px-3 text-gray-500">{u.monthlyCredits > 0 ? u.monthlyCredits : "—"}</td>
                          <td className="py-3 px-3 text-gray-600 text-xs">{u.plan?.name ?? "Free"}</td>
                          <td className="py-3 px-3">
                            {u.veo3Enabled
                              ? <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">ON</span>
                              : <span className="text-[10px] text-gray-400">off</span>}
                          </td>
                          <td className={`py-3 px-3 text-xs ${subExpired ? "text-gray-300" : "text-gray-600"}`}>
                            {fmtDate(u.subscriptionEndsAt)}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={u.role}
                              onChange={e => patch(u.id, { role: e.target.value })}
                              disabled={savingId === u.id}
                              className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAdmin ? "border-blue-200 text-blue-700 bg-blue-50" : "border-gray-200 text-gray-600 bg-white"}`}
                            >
                              <option value="USER">User</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </td>
                          <td className="py-3 px-3 text-gray-600">{u._count.projects}</td>
                          <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(u.createdAt)}</td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => openExpand(u)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors">
                              {expandedId === u.id ? "Close" : "Edit"}
                            </button>
                          </td>
                        </tr>
                        {expandedId === u.id && (
                          <tr key={`${u.id}-expand`} className="bg-blue-50/60 border-b border-blue-100">
                            <td colSpan={10} className="px-5 py-4">
                              <div className="flex flex-wrap items-end gap-4">
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
                                    onChange={e => patch(u.id, { planId: e.target.value || null })}
                                    disabled={savingId === u.id}
                                    className={inputCls}
                                  >
                                    <option value="">Free</option>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2 pb-0.5">
                                  <label className="text-[10px] font-semibold text-gray-400">Veo3</label>
                                  <input
                                    type="checkbox"
                                    checked={u.veo3Enabled}
                                    onChange={e => patch(u.id, { veo3Enabled: e.target.checked })}
                                    disabled={savingId === u.id}
                                    className="w-4 h-4 accent-blue-600"
                                  />
                                </div>
                                <div className="flex gap-2 pb-0.5">
                                  <button
                                    onClick={() => saveExpanded(u)}
                                    disabled={savingId === u.id}
                                    className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-1.5 rounded-lg transition-colors">
                                    {savingId === u.id ? "Saving…" : "Save"}
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
                      </>
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
    </AdminShell>
  );
}
