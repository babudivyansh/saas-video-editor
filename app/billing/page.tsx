"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { useAuthUser } from "@/app/components/useAuthUser";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { CreditsPill } from "@/app/components/ui/CreditsPill";
import { CreditRing } from "@/app/components/ui/CreditRing";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  currency: string;
  credits: number;
  kind: string;
}

interface LaunchCoupon {
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  appliesTo: string;
  expiresAt: string | null;
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

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success");
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState<DbPlan[]>([]);
  const [addons, setAddons] = useState<DbPlan[]>([]);

  // Shared query — mounting alongside AuthContext (same token) shares one
  // cached /api/auth/me request instead of firing an independent fetch.
  const { data: user } = useAuthUser(token() || null);

  // Launch offer banner
  const [launch, setLaunch] = useState<LaunchCoupon | null>(null);
  const [copied, setCopied] = useState(false);

  // Top-up coupon (applies to the next pack / add-on purchase)
  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string } | null>(null);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }

    Promise.all([
      fetch("/api/plans").then(r => r.ok ? r.json() : { plans: [] }),
      fetch("/api/coupons/active").then(r => r.ok ? r.json() : { coupons: [] }),
    ]).then(([plansData, couponData]) => {
      const all: DbPlan[] = plansData.plans ?? [];
      setPacks(all.filter(p => p.kind === "pack"));
      setAddons(all.filter(p => p.kind === "addon"));
      const featured: LaunchCoupon[] = couponData.coupons ?? [];
      if (featured.length > 0) setLaunch(featured[0]);
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
      couponCode: appliedCoupon?.code,
      onSuccess: () => router.push("/billing?success=1"),
      onError: setError,
    });
  }

  // Validate the top-up coupon against the cheapest pack as a proxy (per-user /
  // first-purchase rules are user-level; min-amount only relaxes on pricier packs).
  async function applyTopupCoupon() {
    const cheapest = [...packs].sort((a, b) => a.priceInPaise - b.priceInPaise)[0];
    if (!couponInput.trim() || !cheapest) return;
    setCouponApplying(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ planId: cheapest.slug, code: couponInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAppliedCoupon(null);
        setCouponError(data.error ?? "Could not apply coupon.");
        return;
      }
      setAppliedCoupon({ code: data.code, label: data.label });
    } catch {
      setCouponError("Could not apply coupon. Try again.");
    } finally {
      setCouponApplying(false);
    }
  }

  function copyLaunchCode() {
    if (!launch) return;
    navigator.clipboard?.writeText(launch.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-5 min-w-0">
          <Link href="/dashboard" aria-label="Dashboard home" className="flex-shrink-0">
            <ClipiroLogo className="h-8" />
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
        <CreditsPill credits={balance} />
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">Billing</h1>
          <p className="text-sm text-ink-soft mt-1">Manage your credits and feature add-ons.</p>
        </div>

        {/* ── Launch offer banner ── */}
        {launch && (
          <div className="relative overflow-hidden rounded-[var(--radius-card)] grad-hero px-6 py-5 text-white shadow-glow">
            <div className="clipiro-blob absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">🚀 Launch Special</p>
                <p className="mt-1 font-bold leading-snug">
                  {launch.description ?? `${launch.discountValue}% off your plan`}
                </p>
                {launch.expiresAt && (
                  <p className="text-xs text-white/70 mt-0.5">
                    Ends {new Date(launch.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
              <button
                onClick={copyLaunchCode}
                className="flex-shrink-0 inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 px-4 py-2.5 font-mono font-bold tracking-wider transition-colors cursor-pointer"
              >
                {launch.code}
                <span className="text-xs font-sans font-semibold text-white/80">{copied ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Success / error banners */}
        {success && (
          <div className="bg-tint-emerald border border-green-200 text-green-800 rounded-2xl px-5 py-3.5 text-sm font-medium flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 flex-shrink-0">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Payment successful — credits will appear in your account shortly!
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-5 py-3.5 text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Status Card ── */}
        {hasActivePlan ? (
          <Card className="p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            {/* Left: plan info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block bg-tint-emerald text-green-700 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Active Plan
                </span>
                <span className="text-sm font-semibold text-ink truncate">
                  {user?.plan?.name ?? "Subscription"}
                </span>
              </div>
              <p className={`text-sm font-medium ${daysLeft <= 7 ? "text-red-600" : "text-ink-soft"}`}>
                {daysLeft <= 0
                  ? "Expires today"
                  : daysLeft === 1
                  ? "Expires tomorrow"
                  : `Expires in ${daysLeft} days`}
              </p>
              <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium mt-2 transition-colors">
                Manage plan
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            {/* Right: credit ring */}
            {allowance > 0 && (
              <div className="flex items-center gap-4 bg-tint-violet rounded-2xl px-5 py-4">
                <CreditRing used={used} total={allowance} />
                <div>
                  <p className="text-xs text-ink-soft font-medium">Monthly credits</p>
                  <p className="text-sm font-bold text-ink mt-0.5">{used} / {allowance} used</p>
                  <p className="text-xs text-ink-soft mt-0.5">Total balance: <span className="font-semibold text-ink">{balance}</span></p>
                </div>
              </div>
            )}
          </Card>
        ) : (
          /* No active plan callout */
          <Card tint="violet" className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">You don&apos;t have an active subscription</p>
              <p className="text-sm text-ink-soft mt-1">Top-up credit packs and feature add-ons require an active subscription plan.</p>
            </div>
            <Button variant="primary" size="lg" href="/pricing" className="flex-shrink-0">
              View Plans
            </Button>
          </Card>
        )}

        {/* ── Top-up Credits ── */}
        {hasActivePlan && (
          <section>
            <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-ink">Top-up Credits</h2>
                <p className="text-sm text-ink-soft mt-0.5">One-time purchase · credits never expire · added to your account instantly.</p>
              </div>

              {/* Top-up coupon */}
              <div className="flex-shrink-0">
                {appliedCoupon ? (
                  <div className="flex items-center gap-2 bg-tint-emerald border border-green-200 rounded-full px-3 py-2">
                    <span className="text-xs font-bold text-green-700">🎟 {appliedCoupon.code} · {appliedCoupon.label}</span>
                    <button onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} className="text-xs text-green-700 hover:text-green-900 underline cursor-pointer">Remove</button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyTopupCoupon(); } }}
                        placeholder="Coupon code"
                        className="w-36 bg-white border border-card-border rounded-full px-3.5 py-2 text-sm font-semibold uppercase tracking-wide outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
                      />
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={applyTopupCoupon}
                        disabled={couponApplying || !couponInput.trim()}
                      >
                        {couponApplying ? "…" : "Apply"}
                      </Button>
                    </div>
                    {couponError && <p className="text-xs text-red-600 mt-1.5 text-right">{couponError}</p>}
                  </div>
                )}
              </div>
            </div>

            {appliedCoupon && (
              <p className="text-xs text-green-600 -mt-2 mb-4">Discount applies at checkout to the pack you buy.</p>
            )}

            {packs.length === 0 ? (
              <p className="text-sm text-ink-soft/60 py-6 text-center">Loading credit packs…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {packs.map((pack, i) => {
                  const isLoading = activeId === pack.slug;
                  const isPopular = i === 1; // Starter Pack (100 credits)
                  return (
                    <div
                      key={pack.id}
                      className={`relative bg-white rounded-[var(--radius-card)] border transition-all flex flex-col overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 ${
                        isPopular ? "border-violet-300 shadow-glow" : "border-card-border hover:border-violet-200"
                      }`}
                    >
                      {isPopular && (
                        <div className="grad-brand text-white text-[10px] font-bold text-center py-1 tracking-widest uppercase">
                          Most Popular
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1">
                        <p className="text-sm font-bold text-ink">{pack.name}</p>
                        <p className="text-3xl font-black grad-text inline-block my-3">{pack.credits}</p>
                        <p className="text-xs text-ink-soft mb-4">credits · never expire</p>
                        <p className="text-lg font-extrabold text-ink mb-5">{formatPrice(pack.priceInPaise)}</p>
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => handleBuy(pack.slug)}
                          disabled={!!activeId}
                          className="mt-auto w-full"
                        >
                          {isLoading ? (<><Spinner /> Opening…</>) : "Buy now"}
                        </Button>
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
              <h2 className="text-lg font-extrabold text-ink">Feature Add-ons</h2>
              <p className="text-sm text-ink-soft mt-0.5">One-time unlocks that enhance your plan.</p>
            </div>

            <div className="space-y-3">
              {addons.map(addon => {
                const isVeo3 = addon.slug === "addon_veo3";
                const alreadyUnlocked = isVeo3 && user?.veo3Enabled;
                const isLoading = activeId === addon.slug;
                return (
                  <Card
                    key={addon.id}
                    tint={alreadyUnlocked ? "emerald" : "none"}
                    className={`flex items-center gap-5 px-6 py-5 ${alreadyUnlocked ? "" : "hover:border-violet-200 transition-colors"}`}
                  >
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      alreadyUnlocked ? "bg-green-100 text-green-600" : "grad-brand text-white"
                    }`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-ink text-sm">
                          {isVeo3 ? "Veo3 AI Video" : addon.name}
                        </p>
                        <span className="text-[10px] font-bold bg-tint-violet text-accent-violet px-2 py-0.5 rounded-full uppercase tracking-wide">
                          One-time unlock
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {isVeo3
                          ? "Generate AI videos with Google Veo3. Usage draws from your existing credits."
                          : `Unlock ${addon.name} for your plan.`}
                      </p>
                    </div>

                    {/* Price + button */}
                    <div className="flex-shrink-0 flex items-center gap-4">
                      <p className="text-lg font-extrabold text-ink">{formatPrice(addon.priceInPaise)}</p>
                      {alreadyUnlocked ? (
                        <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 font-bold text-sm px-4 py-2.5 rounded-full">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Unlocked
                        </span>
                      ) : (
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => handleBuy(addon.slug)}
                          disabled={!!activeId}
                        >
                          {isLoading ? (<><Spinner /> Opening…</>) : "Unlock Veo3"}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-ink-soft/60 pb-6">
          Payments powered by Razorpay · Secure &amp; encrypted
        </p>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
