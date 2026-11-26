"use client";

// Browser side of the paywall funnel (POST /api/events/funnel). Fire and
// forget: a failed report never blocks the button that sent it, and keepalive
// lets a click that navigates away still land.

import { useEffect, useRef } from "react";
import { clientAuthToken } from "@/lib/client-session";
import type { UpgradePlacement } from "@/lib/conversion";

export type FunnelEvent =
  | { type: "upgrade_prompt"; placement: UpgradePlacement; action: "shown" | "clicked"; offer?: "trial" | "pack" | "plans" }
  | { type: "plans_viewed"; placement: UpgradePlacement }
  | { type: "checkout"; stage: "dismissed" | "failed"; plan: string; placement: UpgradePlacement; trial?: boolean; reason?: string };

export function trackFunnel(event: FunnelEvent): void {
  if (typeof window === "undefined") return;
  const token = clientAuthToken();
  try {
    void fetch("/api/events/funnel", {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(event),
    }).catch(() => {});
  } catch {
    /* analytics must never throw into the UI */
  }
}

/** Reports an upgrade prompt as shown once, the first time it renders visible. */
export function useTrackShown(
  placement: UpgradePlacement,
  visible: boolean,
  offer?: "trial" | "pack" | "plans",
): void {
  const sent = useRef(false);
  useEffect(() => {
    if (!visible || sent.current) return;
    sent.current = true;
    trackFunnel({ type: "upgrade_prompt", placement, action: "shown", offer });
  }, [visible, placement, offer]);
}
