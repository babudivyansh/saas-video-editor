"use client";

// Relocated from the old profile page's "Billing & Usage" tab — purchase
// history card only. Receipt links are unchanged.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

function IcCard() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>; }
function IcReceipt() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>; }
function IcSpinner() { return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export default function PaymentHistoryPage() {
  const { token } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/purchases", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { purchases: [] }))
      .then((data: { purchases: Purchase[] }) => setPurchases(data.purchases ?? []))
      .catch(() => setPurchases([]))
      .finally(() => setLoaded(true));
  }, [token]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Payment History</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <IcCard />
          <h2 className="text-base font-bold text-gray-900">Purchase History</h2>
        </div>
        {!loaded ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading…</div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500 font-medium">No purchases yet</p>
            <p className="text-xs text-gray-400 mt-1">Your credit pack purchases will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.plan?.name ?? "Credit Pack"}</p>
                  <p className="text-xs text-gray-400">{formatDate(p.createdAt)} · +{p.credits} credits</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatINR(p.amountInPaise)}</p>
                    <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full capitalize">{p.status}</span>
                  </div>
                  <Link
                    href={`/dashboard/profile/receipt/${p.id}`}
                    target="_blank"
                    title="View receipt"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-600 text-gray-400 transition-colors"
                  >
                    <IcReceipt />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
