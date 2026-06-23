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
  kind: string;
}

interface MeUser {
  credits: number;
  monthlyCredits: number | null;
  subscriptionEndsAt: string | null;
  veo3Enabled: boolean;
  plan: { name: string; slug: string } | null;
}

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

// SVG credit ring
function CreditRing({ used, total }: { used: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const dash = pct * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="flex-shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke="#6366f1" strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="39" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
        {used}
      </text>
    </svg>
  );
}

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success");
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState<DbPlan[]>([]);
  const [addons, setAddons] = useState<DbPlan[]>([]);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }

    Promise.all([
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch("/api/plans").then(r => r.ok ? r.json() : { plans: [] }),
    ]).then(([meData, plansData]) => {
      if (meData.user) setUser(meData.user);
      const all: DbPlan[] = plansData.plans ?? [];
      setPacks(all.filter(p => p.kind === "pack"));
      setAddons(all.filter(p => p.kind === "addon"));
    }).catch(() => setError("Failed to load billing data."))
      .finally(() => setLoading(false));
  }, [router]);

  const endsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  const hasActivePlan = !!endsAt && endsAt > new Date();
  const daysLeft = endsAt ? daysUntil(endsAt) : 0;

  // Monthly credits used this cycle: monthlyCredits is the allowance; credits is the current balance
  // Used = allowance - (balance - any topups). Since we don't track topups separately, show balance vs allowance.
  const allowance = user?.monthlyCredits ?? 0;
  const balance = user?.credits ?? 0;
  const used = Math.max(0, allowance - balance);

  function handleBuy(slug: string) {
    setError("");
    startCheckout({
      planId: slug,
      onSuccess: () => router.push("/billing?success=1"),
      onError: setError,
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </Link>
        <span className="text-sm font-semibold text-gray-900">
          {balance !== null ? `${balance} credits` : ""}
        </span>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your credits and feature add-ons.</p>
        </div>

        {/* Success / error banners */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3.5 text-sm font-medium flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 flex-shrink-0">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Payment successful — credits will appear in your account shortly!
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3.5 text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Status Card ── */}
        {hasActivePlan ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            {/* Left: plan info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Active Plan
                </span>
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {user?.plan?.name ?? "Subscription"}
                </span>
              </div>
              <p className={`text-sm font-medium ${daysLeft <= 7 ? "text-red-600" : "text-gray-500"}`}>
                {daysLeft <= 0
                  ? "Expires today"
                  : daysLeft === 1
                  ? "Expires tomorrow"
                  : `Expires in ${daysLeft} days`}
              </p>
              <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 transition-colors">
                Manage plan
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            {/* Right: credit ring */}
            {allowance > 0 && (
              <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-5 py-4">
                <CreditRing used={used} total={allowance} />
                <div>
                  <p className="text-xs text-gray-500 font-medium">Monthly credits</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{used} / {allowance} used</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total balance: <span className="font-semibold text-gray-800">{balance}</span></p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No active plan callout */
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">You don&apos;t have an active subscription</p>
              <p className="text-sm text-gray-500 mt-1">Top-up credit packs and feature add-ons require an active subscription plan.</p>
            </div>
            <Link
              href="/pricing"
              className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              View Plans
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        )}

        {/* ── Top-up Credits ── */}
        {hasActivePlan && (
          <section>
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">Top-up Credits</h2>
              <p className="text-sm text-gray-500 mt-0.5">One-time purchase · credits never expire · added to your account instantly.</p>
            </div>

            {packs.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Loading credit packs…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {packs.map((pack, i) => {
                  const isLoading = activeId === pack.slug;
                  const isPopular = i === 1; // Starter Pack (100 credits)
                  return (
                    <div
                      key={pack.id}
                      className={`relative bg-white rounded-2xl border-2 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden ${
                        isPopular ? "border-indigo-400" : "border-gray-100 hover:border-indigo-200"
                      }`}
                    >
                      {isPopular && (
                        <div className="bg-indigo-500 text-white text-[10px] font-bold text-center py-1 tracking-widest uppercase">
                          Most Popular
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1">
                        <p className="text-sm font-bold text-gray-900">{pack.name}</p>
                        <p className="text-3xl font-black text-indigo-500 my-3">{pack.credits}</p>
                        <p className="text-xs text-gray-400 mb-4">credits · never expire</p>
                        <p className="text-lg font-extrabold text-gray-900 mb-5">{formatPrice(pack.priceInPaise)}</p>
                        <button
                          onClick={() => handleBuy(pack.slug)}
                          disabled={!!activeId}
                          className="mt-auto w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 text-sm"
                        >
                          {isLoading ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Opening…
                            </>
                          ) : (
                            "Buy now"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Feature Add-ons ── */}
        {hasActivePlan && addons.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">Feature Add-ons</h2>
              <p className="text-sm text-gray-500 mt-0.5">One-time unlocks that enhance your plan.</p>
            </div>

            <div className="space-y-3">
              {addons.map(addon => {
                const isVeo3 = addon.slug === "addon_veo3";
                const alreadyUnlocked = isVeo3 && user?.veo3Enabled;
                const isLoading = activeId === addon.slug;
                return (
                  <div
                    key={addon.id}
                    className={`bg-white rounded-2xl border-2 shadow-sm flex items-center gap-5 px-6 py-5 ${
                      alreadyUnlocked ? "border-green-200 bg-green-50/30" : "border-gray-100 hover:border-indigo-200 transition-colors"
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      alreadyUnlocked ? "bg-green-100" : "bg-indigo-100"
                    }`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${alreadyUnlocked ? "text-green-600" : "text-indigo-600"}`}>
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-sm">
                          {isVeo3 ? "Veo3 AI Video" : addon.name}
                        </p>
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          One-time unlock
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isVeo3
                          ? "Generate AI videos with Google Veo3. Usage draws from your existing credits."
                          : `Unlock ${addon.name} for your plan.`}
                      </p>
                    </div>

                    {/* Price + button */}
                    <div className="flex-shrink-0 flex items-center gap-4">
                      <p className="text-lg font-extrabold text-gray-900">{formatPrice(addon.priceInPaise)}</p>
                      {alreadyUnlocked ? (
                        <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 font-bold text-sm px-4 py-2.5 rounded-xl">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Unlocked
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBuy(addon.slug)}
                          disabled={!!activeId}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isLoading ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Opening…
                            </>
                          ) : (
                            "Unlock Veo3"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-gray-400 pb-6">
          Payments powered by Razorpay · Secure &amp; encrypted
        </p>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
