"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { formatINR } from "@/lib/format";

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string } | null;
}

// Long-month variant kept local — receipts spell the month out, unlike the
// short-form lib/format helper used elsewhere.
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/purchases", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : { purchases: [] }))
      .then((data: { purchases: Purchase[] }) =>
        setPurchase(data.purchases.find(p => p.id === id) ?? null)
      )
      .catch(() => setPurchase(null))
      .finally(() => setLoading(false));
  }, [token, id]);

  return (
    <div className="min-h-screen bg-surface py-12 px-4 print:bg-white print:py-0">
      <div className="max-w-lg mx-auto">
        {/* Controls — hidden when printing */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link href="/dashboard/profile/payment-history" className="text-sm font-semibold text-ink-soft hover:text-ink inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>
            Back to profile
          </Link>
          {purchase && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 grad-brand hover:brightness-105 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-glow transition-all cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
              Print / Save as PDF
            </button>
          )}
        </div>

        {/* Receipt card */}
        <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-8 print:border-0 print:shadow-none">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !purchase ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-700">Receipt not found</p>
              <p className="text-sm text-gray-400 mt-1">This purchase doesn&apos;t exist or isn&apos;t yours.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between pb-6 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="grad-brand text-white rounded-lg w-8 h-8 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  </span>
                  <span className="font-black text-gray-900 text-lg tracking-tight">CLIPIRO</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Receipt</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(purchase.createdAt)}</p>
                </div>
              </div>

              {/* Billed to */}
              <div className="py-6 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Billed to</p>
                <p className="text-sm font-semibold text-gray-900">{user?.name || user?.email || "—"}</p>
                {user?.name && <p className="text-sm text-gray-500">{user.email}</p>}
              </div>

              {/* Line items */}
              <div className="py-6 space-y-3">
                {[
                  ["Payment ID", purchase.id],
                  ["Item", purchase.plan?.name ?? "Credit Pack"],
                  ["Credits added", `+${purchase.credits.toLocaleString("en-IN")}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-sm font-semibold text-gray-900 text-right break-all">{value}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <div>
                  <p className="font-bold text-gray-900">Total paid</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold text-green-700 bg-tint-emerald px-2 py-0.5 rounded-full capitalize">
                    {purchase.status}
                  </span>
                </div>
                <p className="text-2xl font-black grad-text inline-block">{formatINR(purchase.amountInPaise)}</p>
              </div>

              <p className="text-center text-xs text-gray-400 mt-8">
                Thank you for your purchase · Payments secured by Razorpay
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
