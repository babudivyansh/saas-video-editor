"use client";

// Shared insufficient-credits (402) experience. Any dashboard surface that
// gets an insufficient_credits response calls
// `useInsufficientCredits().open({ required })` instead of rendering a dead
// red error string — the modal shows the shortfall, preselects the smallest
// top-up pack that covers it, auto-applies the TOPUP15 coupon when the user
// is eligible, and completes checkout in place.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { InsufficientCreditsModal } from "./InsufficientCreditsModal";

export interface InsufficientCreditsInfo {
  /** Credits the blocked action needed (from the API response, if known). */
  required?: number;
  /** Current balance (from the API response, if known). */
  balance?: number;
  /** Short label for what was blocked, e.g. "Render", "Auto Clips". */
  action?: string;
}

interface CreditModalApi {
  open: (info?: InsufficientCreditsInfo) => void;
  /** Convenience: opens the modal when `res` is a 402; returns whether it was. */
  handle402: (res: Response, info?: InsufficientCreditsInfo) => Promise<boolean>;
}

const Ctx = createContext<CreditModalApi | null>(null);

export function useInsufficientCredits(): CreditModalApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInsufficientCredits must be used inside CreditModalProvider");
  return ctx;
}

export function CreditModalProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<InsufficientCreditsInfo | null>(null);

  const open = useCallback((i?: InsufficientCreditsInfo) => setInfo(i ?? {}), []);
  const handle402 = useCallback(async (res: Response, i?: InsufficientCreditsInfo) => {
    if (res.status !== 402) return false;
    let body: { balance?: number; required?: number } = {};
    try { body = await res.clone().json(); } catch { /* body optional */ }
    setInfo({ balance: body.balance, required: body.required, ...i });
    return true;
  }, []);

  const api = useMemo(() => ({ open, handle402 }), [open, handle402]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {info && <InsufficientCreditsModal info={info} onClose={() => setInfo(null)} />}
    </Ctx.Provider>
  );
}
