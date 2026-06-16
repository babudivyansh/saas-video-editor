"use client";
import { useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
  plan: { name: string; slug: string } | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminPurchasesPage() {
  const { token, user } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    fetch("/api/admin/purchases", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : { purchases: [] }))
      .then(data => setPurchases(data.purchases ?? []))
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const total = purchases.reduce((s, p) => s + p.amountInPaise, 0);

  return (
    <AdminShell title="Purchases">
      {loading ? (
        <p className="text-sm text-gray-400">Loading purchases…</p>
      ) : purchases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm font-semibold text-gray-600">No purchases yet</p>
          <p className="text-xs text-gray-400 mt-1">Captured Razorpay payments will appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-5 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-2xl font-extrabold text-gray-900">{purchases.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Transactions</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-2xl font-extrabold text-gray-900">₹{Math.round(total / 100).toLocaleString("en-IN")}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total Revenue</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="py-3.5 px-5">User</th>
                    <th className="py-3.5 px-3">Plan</th>
                    <th className="py-3.5 px-3">Amount</th>
                    <th className="py-3.5 px-3">Credits</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 px-5 text-gray-700">{p.user?.name || p.user?.email || "—"}</td>
                      <td className="py-3 px-3 text-gray-600">{p.plan?.name ?? "—"}</td>
                      <td className="py-3 px-3 font-semibold text-gray-900">₹{Math.round(p.amountInPaise / 100).toLocaleString("en-IN")}</td>
                      <td className="py-3 px-3 text-gray-600">+{p.credits}</td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full capitalize">{p.status}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
