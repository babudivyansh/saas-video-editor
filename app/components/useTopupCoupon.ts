"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";

export interface TopupCart {
  /** The actual plan/pack slug the user is about to buy — not a "cheapest
   *  pack as proxy" stand-in. Coupon validation runs against this real cart. */
  planId: string;
  addonIds?: string[];
}

export interface AppliedCoupon {
  code: string;
  label: string;
  discountInPaise: number;
}

export interface UseTopupCoupon {
  couponInput: string;
  setCouponInput: (v: string) => void;
  appliedCoupon: AppliedCoupon | null;
  applying: boolean;
  error: string;
  apply: () => Promise<void>;
  clear: () => void;
}

/**
 * Single source of truth for the top-up coupon-apply flow. Replaces the
 * near-identical logic previously duplicated across billing/page.tsx,
 * dashboard/profile/credits/page.tsx, and (a more-correct variant of) this
 * same logic in pricing/page.tsx. Unlike the two former implementations,
 * this always validates against the real selected cart (`planId`/`addonIds`)
 * rather than "the cheapest pack as a proxy".
 */
export function useTopupCoupon(cart: TopupCart): UseTopupCoupon {
  const { token } = useAuth();
  const [couponInput, setCouponInputState] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const setCouponInput = useCallback((v: string) => {
    setCouponInputState(v.toUpperCase());
    setError("");
  }, []);

  const clear = useCallback(() => {
    setAppliedCoupon(null);
    setError("");
  }, []);

  const apply = useCallback(async () => {
    if (!couponInput.trim() || !cart.planId) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: cart.planId, addonIds: cart.addonIds ?? [], code: couponInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAppliedCoupon(null);
        setError(data.error ?? "Could not apply coupon.");
        return;
      }
      setAppliedCoupon({ code: data.code, label: data.label, discountInPaise: data.discountInPaise });
    } catch {
      setError("Could not apply coupon. Try again.");
    } finally {
      setApplying(false);
    }
  }, [couponInput, cart.planId, cart.addonIds, token]);

  return { couponInput, setCouponInput, appliedCoupon, applying, error, apply, clear };
}
