"use client";

// Focused zero-credit conversion modal (2026-07 pricing audit): shown when an
// action fails with 402. Instead of a dead-end error it offers the smallest
// top-up pack that covers the shortfall (preselected), auto-applies the
// TOPUP15 coupon when the account is eligible, and checks out in place.
// A link to /pricing covers users who'd rather upgrade their plan.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import type { InsufficientCreditsInfo } from "./CreditModalContext";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;
  kind: string;
}

const TOPUP_COUPON = "TOPUP15";

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function InsufficientCreditsModal({ info, onClose }: {
  info: InsufficientCreditsInfo;
  onClose: () => void;
}) {
  const { user, token, refreshUser } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();
  const fireReviewPrompt = useReviewPromptTrigger();
  const { openBilling } = useBillingOverlay();

  const [packs, setPacks] = useState<DbPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; discountInPaise: number } | null>(null);
  const [done, setDone] = useState(false);

  const balance = info.balance ?? user?.credits ?? 0;
  const shortfall = info.required != null ? Math.max(info.required - balance, 0) : null;

  useEffect(() => {
    fetch("/api/plans")
      .then((res) => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => {
        const p = (data.plans ?? []).filter((x) => x.kind === "pack").sort((a, b) => a.credits - b.credits);
        setPacks(p);
        // Preselect the smallest pack that covers the shortfall (or the smallest pack).
        const covering = shortfall != null ? p.find((x) => x.credits >= shortfall) : undefined;
        setSelected((covering ?? p[0])?.slug ?? null);
      })
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort TOPUP15 auto-apply — validation enforces eligibility
  // server-side; a rejection just means full price, silently.
  useEffect(() => {
    if (!selected || !token) { setCoupon(null); return; }
    let cancelled = false;
    fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId: selected, addonIds: [], code: TOPUP_COUPON }),
    })
      .then((res) => res.json())
      .then((data: { error?: string; code?: string; discountInPaise?: number }) => {
        if (cancelled) return;
        if (data.error || !data.code) setCoupon(null);
        else setCoupon({ code: data.code, discountInPaise: data.discountInPaise ?? 0 });
      })
      .catch(() => { if (!cancelled) setCoupon(null); });
    return () => { cancelled = true; };
  }, [selected, token]);

  const selectedPack = useMemo(() => packs.find((p) => p.slug === selected) ?? null, [packs, selected]);
  const totalPaise = selectedPack
    ? Math.max(selectedPack.priceInPaise - (coupon?.discountInPaise ?? 0), 100)
    : 0;
  const paying = selectedPack != null && activeId === selectedPack.slug;

  function buy() {
    if (!selectedPack) return;
    void startCheckout({
      planId: selectedPack.slug,
      couponCode: coupon?.code,
      onSuccess: () => {
        setDone(true);
        void refreshUser?.();
        fireReviewPrompt("billing_success", { featureHint: "billing" }).catch(() => { /* non-critical */ });
      },
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Out of credits">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={paying ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-md bg-panel rounded-2xl shadow-2xl p-7">
        <button
          onClick={onClose}
          disabled={paying}
          className="absolute top-4 right-4 p-1.5 rounded-full text-fg-subtle hover:text-fg-muted hover:bg-surface-3 transition-all disabled:opacity-40"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-tint-emerald flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 text-success">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold text-fg">Credits added</h2>
            <p className="text-sm text-fg-muted mt-1.5">Your top-up is on your account — retry your {info.action?.toLowerCase() ?? "action"} whenever you&apos;re ready.</p>
            <button onClick={onClose} className="mt-6 w-full bg-blue-600 text-white font-bold py-3 rounded-full hover:bg-blue-700 transition-colors">
              Back to work
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-fg pr-8">
              {info.action ? `${info.action} needs more credits` : "You're out of credits"}
            </h2>
            <p className="text-sm text-fg-muted mt-1.5">
              {info.required != null
                ? <>This needs <strong>{info.required}</strong> credit{info.required === 1 ? "" : "s"} — you have <strong>{balance}</strong>.</>
                : <>Your balance is <strong>{balance}</strong> credit{balance === 1 ? "" : "s"}.</>}
              {" "}Top up below, or{" "}
              {/* /billing, not /pricing: the user is signed in, and /billing is
                  where plan changes happen (PlansModal) without bouncing them
                  out to the marketing site. */}
              <button
                onClick={() => { onClose(); openBilling({ view: "plans" }); }}
                className="text-blue-600 underline hover:text-blue-800 cursor-pointer"
              >
                upgrade your plan
              </button>{" "}
              for monthly credits at a better rate.
            </p>

            <div className="mt-5 space-y-2.5">
              {loading && [0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-surface-3 animate-pulse" />)}
              {!loading && packs.map((pack) => {
                const active = pack.slug === selected;
                const covers = shortfall == null || pack.credits >= shortfall;
                return (
                  <label
                    key={pack.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      active ? "border-blue-600 bg-blue-50/30 shadow-sm" : "border-line hover:border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="topup-pack"
                      checked={active}
                      onChange={() => setSelected(pack.slug)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fg text-sm">{pack.name}</p>
                      <p className="text-xs text-fg-muted">{pack.credits} credits · never expire{covers ? "" : " · won't fully cover this"}</p>
                    </div>
                    <p className="font-bold text-fg whitespace-nowrap">{formatPrice(pack.priceInPaise)}</p>
                  </label>
                );
              })}
            </div>

            {coupon && coupon.discountInPaise > 0 && selectedPack && (
              <p className="mt-3 text-xs font-semibold text-success bg-tint-emerald border border-tint-emerald-border rounded-lg px-3 py-2">
                🎟 {coupon.code} applied — you pay {formatPrice(totalPaise)} (save {formatPrice(coupon.discountInPaise)})
              </p>
            )}

            <button
              onClick={buy}
              disabled={!selectedPack || paying}
              className="mt-5 w-full bg-blue-600 text-white font-bold py-3.5 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {paying ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing…
                </>
              ) : selectedPack ? (
                <>Add {selectedPack.credits} credits · {formatPrice(totalPaise)}</>
              ) : (
                "Select a pack"
              )}
            </button>
            <p className="text-[11px] text-fg-subtle text-center mt-2.5">Secure payment via Razorpay · packs never expire</p>
          </>
        )}
      </div>
    </div>
  );
}
