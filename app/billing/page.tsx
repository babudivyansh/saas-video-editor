"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const PACKS = [
  { id: "price_starter", label: "Starter", credits: 60, price: "$9" },
  { id: "price_pro", label: "Pro", credits: 180, price: "$19" },
  { id: "price_unlimited", label: "Studio", credits: 600, price: "$49" },
];

function token() { return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""; }

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success");
  const canceled = params.get("canceled");
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.user) setCredits(d.user.credits); });
  }, [router]);

  async function checkout(priceId: string) {
    setLoading(priceId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ priceId }),
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } finally { setLoading(null); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-zinc-800">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">← Dashboard</Link>
        <span className="text-sm text-zinc-400">{credits !== null ? `${credits} credits remaining` : ""}</span>
      </nav>
      <main className="flex-1 px-8 py-16 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">Buy credits</h1>
        <p className="text-zinc-500 text-center mb-10">1 credit = 1 video render</p>

        {success && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-5 py-3 text-sm mb-6">
            Payment successful — credits added to your account!
          </div>
        )}
        {canceled && (
          <div className="bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-xl px-5 py-3 text-sm mb-6">
            Payment canceled.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PACKS.map(pack => (
            <div key={pack.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center">
              <h2 className="text-lg font-semibold text-white mb-1">{pack.label}</h2>
              <p className="text-4xl font-extrabold text-violet-400 my-3">{pack.price}</p>
              <p className="text-sm text-zinc-400 mb-6">{pack.credits} credits</p>
              <button
                onClick={() => checkout(pack.id)}
                disabled={loading === pack.id}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading === pack.id ? "Redirecting…" : "Buy now"}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-zinc-500">Loading…</div>}>
      <BillingContent />
    </Suspense>
  );
}
