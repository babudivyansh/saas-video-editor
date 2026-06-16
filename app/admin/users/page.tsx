"use client";
import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface PlanRef { id: string; name: string; slug: string }
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  role: "USER" | "ADMIN";
  createdAt: string;
  plan: PlanRef | null;
  _count: { projects: number };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<PlanRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    const [u, p] = await Promise.all([
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }).then(r => (r.ok ? r.json() : { users: [] })),
      fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } }).then(r => (r.ok ? r.json() : { plans: [] })),
    ]);
    setUsers(u.users ?? []);
    setPlans(p.plans ?? []);
    setLoading(false);
  }, [token, user?.role]);

  useEffect(() => { load(); }, [load]);

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
        setUsers(prev => prev.map(x => (x.id === id ? { ...x, ...data.user } as AdminUser : x)));
      }
    } finally {
      setSavingId(null);
    }
  }

  function adjustCredits(u: AdminUser, delta: number) {
    patch(u.id, { credits: Math.max(0, u.credits + delta) });
  }

  return (
    <AdminShell title="Users">
      {loading ? (
        <p className="text-sm text-gray-400">Loading users…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="py-3.5 px-5">User</th>
                  <th className="py-3.5 px-3">Videos</th>
                  <th className="py-3.5 px-3">Credits</th>
                  <th className="py-3.5 px-3">Plan</th>
                  <th className="py-3.5 px-3">Role</th>
                  <th className="py-3.5 px-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-gray-900">{u.name || u.email}</p>
                      {u.name && <p className="text-xs text-gray-400">{u.email}</p>}
                    </td>
                    <td className="py-3 px-3 text-gray-600">{u._count.projects}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => adjustCredits(u, -10)} disabled={savingId === u.id}
                          className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 leading-none">−</button>
                        <span className="w-10 text-center font-semibold text-gray-900">{u.credits}</span>
                        <button onClick={() => adjustCredits(u, 10)} disabled={savingId === u.id}
                          className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 leading-none">+</button>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={u.plan?.id ?? ""}
                        onChange={e => patch(u.id, { planId: e.target.value || null })}
                        disabled={savingId === u.id}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Free</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={u.role}
                        onChange={e => patch(u.id, { role: e.target.value })}
                        disabled={savingId === u.id}
                        className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${u.role === "ADMIN" ? "border-blue-200 text-blue-700 bg-blue-50" : "border-gray-200 text-gray-600 bg-white"}`}
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
