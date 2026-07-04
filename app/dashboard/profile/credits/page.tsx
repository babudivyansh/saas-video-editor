"use client";

// Relocated from the old profile page's "Plan & Credits" credit-ring half plus
// the entire "Top Up Credits" / "Credit Usage" cards from the Billing & Usage tab.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";

function IcZap() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>; }
function IcPlus() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 5v14M5 12h14" /></svg>; }
function IcVideo() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>; }
function IcSpinner() { return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }

interface Project {
  id: string;
  title: string;
  productType: string;
  status: string;
  createdAt: string;
}

interface Pack {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;
  kind: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  "split-screen": "Split Screen",
  "streamer-video": "Streamer Video",
  "reddit-video": "Reddit Story",
  "text-video": "Fake Text",
};

function ProductBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    "split-screen": "bg-purple-100 text-purple-700",
    "streamer-video": "bg-orange-100 text-orange-700",
    "reddit-video": "bg-red-100 text-red-700",
    "text-video": "bg-teal-100 text-teal-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[type] ?? "bg-gray-100 text-gray-600"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function CreditRing({ credits, denom }: { credits: number; denom: number }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, denom > 0 ? credits / denom : 0));
  const offset = circ * (1 - pct);
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="#2563eb" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-gray-900 leading-none">{credits}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">credits</span>
      </div>
    </div>
  );
}

export default function CreditsPage() {
  const { user, token, refreshUser } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packsLoaded, setPacksLoaded] = useState(false);

  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const endsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  const hasActivePlan = !!endsAt && endsAt > new Date();
  const monthlyCredits = user?.monthlyCredits ?? 0;
  const ringDenom = monthlyCredits > 0 ? monthlyCredits : Math.max(user?.credits ?? 0, 1);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = (await res.json()) as { projects: Project[] };
        setProjects(data.projects);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    if (!token || packsLoaded) return;
    fetch("/api/plans")
      .then((res) => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: Pack[] }) => setPacks((data.plans ?? []).filter((p) => p.kind === "pack")))
      .catch(() => setPacks([]))
      .finally(() => setPacksLoaded(true));
  }, [token, packsLoaded]);

  function handleBuyCredits(pack: Pack) {
    startCheckout({
      planId: pack.slug,
      couponCode: appliedCoupon?.code,
      onSuccess: () => {
        setToast("✓ Payment confirmed — your credits have been added.");
        setTimeout(() => setToast(null), 4000);
        refreshUser();
        setTimeout(() => refreshUser(), 2500);
      },
    });
  }

  async function applyTopupCoupon() {
    const cheapest = [...packs].sort((a, b) => a.priceInPaise - b.priceInPaise)[0];
    if (!couponInput.trim() || !cheapest) return;
    setCouponApplying(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  const usage = projects
    .filter((p) => p.status === "completed")
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const usageByDay = (() => {
    const days: { label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const count = usage.filter((p) => {
        const t = +new Date(p.createdAt);
        return t >= +d && t < +next;
      }).length;
      days.push({ label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count });
    }
    return days;
  })();
  const maxUsage = Math.max(1, ...usageByDay.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Credits</h1>
      </div>

      {/* Credit ring */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-6">
        <CreditRing credits={user?.credits ?? 0} denom={ringDenom} />
        <div>
          <p className="text-sm font-semibold text-gray-800">Available balance</p>
          <p className="text-xs text-gray-500 mt-0.5">Credits are spent per tool use and top-up packs never expire.</p>
        </div>
      </div>

      {/* Top Up Credits */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
          <div>
            <div className="flex items-center gap-2">
              <IcZap />
              <h2 className="text-base font-bold text-gray-900">Top Up Credits</h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">One-time purchase · credits never expire · added instantly after payment.</p>
          </div>

          {hasActivePlan && packsLoaded && packs.length > 0 && (
            <div className="flex-shrink-0">
              {appliedCoupon ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-bold text-green-700">🎟 {appliedCoupon.code} · {appliedCoupon.label}</span>
                  <button onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} className="text-xs text-green-700 hover:text-green-900 underline">Remove</button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyTopupCoupon(); } }}
                      placeholder="Coupon code"
                      className="w-36 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={applyTopupCoupon}
                      disabled={couponApplying || !couponInput.trim()}
                      className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
                    >
                      {couponApplying ? "…" : "Apply"}
                    </button>
                  </div>
                  {couponError && <p className="text-xs text-red-600 mt-1.5 text-right">{couponError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {appliedCoupon && <p className="text-xs text-green-600 mb-4">Discount applies at checkout to the pack you buy.</p>}

        {!hasActivePlan ? (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Top-up packs require an active subscription</p>
              <p className="text-xs text-gray-500 mt-0.5">Subscribe to any plan, then buy credit packs anytime.</p>
            </div>
            <Link href="/pricing"
              className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              <IcZap /> Subscribe to unlock
            </Link>
          </div>
        ) : !packsLoaded ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading packs…</div>
        ) : packs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No credit packs are available right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packs.map((pack) => {
              const isBuying = activeId === pack.slug;
              return (
                <div key={pack.id} className="rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-all p-5 flex flex-col text-center shadow-sm">
                  <p className="text-sm font-bold text-gray-900">{pack.name}</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">{formatINR(pack.priceInPaise)}</p>
                  <p className="text-xs text-gray-500 mt-1 mb-4">{pack.credits.toLocaleString("en-IN")} credits</p>
                  <button
                    onClick={() => handleBuyCredits(pack)}
                    disabled={!!activeId}
                    className="mt-auto w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isBuying ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buying…</>
                    ) : (
                      <><IcPlus /> Buy</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credit usage */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <IcVideo />
          <h2 className="text-base font-bold text-gray-900">Credit Usage</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading…</div>
        ) : usage.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500 font-medium">No usage yet</p>
            <p className="text-xs text-gray-400 mt-1">Credit cost varies by tool (1–20 credits).</p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Last 14 days</p>
              <div className="flex items-end gap-1 h-20">
                {usageByDay.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.label}: ${d.count}`}>
                    <div
                      className="w-full bg-blue-500/80 group-hover:bg-blue-600 rounded-sm transition-all"
                      style={{ height: `${(d.count / maxUsage) * 100}%`, minHeight: d.count > 0 ? "4px" : "2px", opacity: d.count > 0 ? 1 : 0.25 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {usage.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ProductBadge type={p.productType} />
                    <span className="text-xs font-bold text-red-500">−1</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
