"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  currency: string;
  credits: number;
}

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success");
  const { startCheckout, activeId } = useRazorpayCheckout();
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState<DbPlan[]>([]);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (d.user) setCredits(d.user.credits);
      });
    // Load only top-up packs (kind = "pack") — subscriptions are managed on /pricing.
    fetch("/api/plans")
      .then(r => (r.ok ? r.json() : { plans: [] }))
      .then((d: { plans: (DbPlan & { kind: string })[] }) =>
        setPacks(d.plans.filter(p => p.kind === "pack") ?? [])
      )
      .catch(() => setPacks([]));
  }, [router]);

  const formatPrice = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

  function handleBuy(packId: string) {
    setError("");
    startCheckout({
      planId: packId,
      // Payment captured — webhook handles credit top-up server-side
      onSuccess: () => router.push("/billing?success=1"),
      onError: setError,
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-zinc-800">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">← Dashboard</Link>
        <span className="text-sm text-zinc-400">
          {credits !== null ? `${credits} credits remaining` : ""}
        </span>
      </nav>

      <main className="flex-1 px-8 py-16 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">Top Up Credits</h1>
        <p className="text-zinc-500 text-center mb-10">One-time purchase · credits never expire · added to your account instantly</p>

        {success && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-5 py-3 text-sm mb-6">
            Payment successful — credits will appear shortly!
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-5 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {packs.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-8">Loading credit packs…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packs.map(pack => (
              <div key={pack.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center">
                <h2 className="text-lg font-semibold text-white mb-1">{pack.name}</h2>
                <p className="text-4xl font-extrabold text-violet-400 my-3">{formatPrice(pack.priceInPaise)}</p>
                <p className="text-sm text-zinc-400 mb-6">{pack.credits} credits</p>
                <button
                  onClick={() => handleBuy(pack.slug)}
                  disabled={activeId === pack.slug}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {activeId === pack.slug ? "Opening payment…" : "Buy now"}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-zinc-600 mt-8">
          Payments powered by Razorpay · Secure &amp; encrypted
        </p>
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
