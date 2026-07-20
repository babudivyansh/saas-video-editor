"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { loadRazorpayScript } from "@/lib/razorpay";

// Razorpay attaches its constructor to window once the checkout script loads.
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

export interface StartCheckoutArgs {
  /** Base plan or pack slug. */
  planId: string;
  /** Optional pack slugs to bundle into the same payment. */
  addonIds?: string[];
  /** Optional coupon code applied to the order total at checkout. */
  couponCode?: string;
  /** Request the 7-day Pro trial (server validates eligibility/tier). */
  trial?: boolean;
  /** Checkout currency; defaults server-side to INR. */
  currency?: "INR" | "USD";
  /** Fired from the Razorpay success handler (e.g. refreshUser + toast, or a redirect). */
  onSuccess?: () => void;
  /** Surface a checkout error. Defaults to window.alert. */
  onError?: (message: string) => void;
}

type CheckoutResponse =
  | { mode: "order"; orderId: string; amount: number; currency: string; keyId: string; packName: string; credits: number }
  | { mode: "subscription"; subscriptionId: string; keyId: string; packName: string; credits: number; trial: boolean };

export interface UseRazorpayCheckout {
  startCheckout: (args: StartCheckoutArgs) => Promise<void>;
  /** True from script load until the Razorpay modal is opened, succeeds, or is dismissed. */
  loading: boolean;
  /** The planId currently in flight — lets callers show a per-card spinner. */
  activeId: string | null;
}

/**
 * Single source of truth for the Razorpay top-up / checkout flow. Replaces the
 * logic previously duplicated in the pricing, billing, and profile pages.
 *
 * The in-flight state is cleared only by the Razorpay `handler` (success) and
 * `modal.ondismiss` callbacks — never in a `finally` right after `open()`, which
 * would clear the spinner before the modal even closes.
 */
export function useRazorpayCheckout(): UseRazorpayCheckout {
  const { user, token } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);

  const startCheckout = useCallback(
    async ({ planId, addonIds = [], couponCode, trial, currency, onSuccess, onError }: StartCheckoutArgs) => {
      const fail = (message: string) => (onError ? onError(message) : alert(message));
      if (!user || !token) {
        fail("Please sign in to continue.");
        return;
      }

      setActiveId(planId);
      let opened = false;
      try {
        const ok = await loadRazorpayScript();
        if (!ok) {
          fail("Failed to load Razorpay. Please check your internet connection.");
          return;
        }

        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ planId, addonIds, couponCode, trial, currency }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          fail(err.error ?? "Checkout failed. Please try again.");
          return;
        }

        const data = (await res.json()) as CheckoutResponse;

        const rzp = new window.Razorpay({
          key: data.keyId,
          name: "Clipiro",
          description: data.packName,
          prefill: { email: user.email },
          theme: { color: "#2563eb" },
          ...(data.mode === "order"
            ? { amount: data.amount, currency: data.currency, order_id: data.orderId }
            : { subscription_id: data.subscriptionId, recurring: 1 }),
          handler: async (response: RazorpaySuccess) => {
            // One-time orders need explicit server-side verification; a
            // subscription's first charge is granted entirely by the
            // subscription.activated / subscription.charged webhooks, so
            // there's nothing to verify here.
            try {
              if (data.mode === "order") {
                await fetch("/api/billing/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                });
              }
            } catch {
              // Payment succeeded but verification call failed — the webhook is
              // the backup. onSuccess still fires; credits/plan arrive shortly.
            } finally {
              setActiveId(null);
              onSuccess?.();
            }
          },
          modal: {
            ondismiss: () => setActiveId(null),
          },
        });

        rzp.open();
        opened = true;
      } finally {
        // Only reset here if the modal never opened (error path); otherwise the
        // handler / ondismiss callbacks own the reset.
        if (!opened) setActiveId(null);
      }
    },
    [user, token],
  );

  return { startCheckout, loading: activeId !== null, activeId };
}
