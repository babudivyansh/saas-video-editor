"use client";

// The upgrade moment for free users: the clips page, right when the clips
// they made are on screen, and the first time they go to download one.
//
// Free clips are watermarked and capped at 720p (lib/plans/tiers.ts), which
// is the clearest reason to pay — but until 2026-11-19 nothing in the app said
// so; Upgrade and trial buttons lived only on the plans page. Of 20 users who
// got clips in Oct–Nov 2026, none started the 7-day Pro trial.
//
// Both pieces open the plans view in place (useOpenPlans). Neither blocks a
// download: the dialog's "Download anyway" is always one click away.

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useOpenPlans } from "@/app/components/billing/BillingOverlayContext";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { TRIAL_DAYS } from "@/lib/plans/tiers";

const BANNER_DISMISSED_KEY = "clipiro:wm-banner-dismissed-until";
const BANNER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const GATE_SEEN_KEY = "clipiro:wm-download-gate-seen";

/** Whether the signed-in user is on the free tier, and if so whether the Pro
 *  trial is still open to them (once per account, never after a purchase). */
export function useFreeTierState(): { isFree: boolean; trialEligible: boolean } {
  const { user } = useAuth();
  const isFree = !!user && user.tier === "free";
  const trialEligible = isFree && !user?.trialUsedAt && !user?.hasPurchased;
  return { isFree, trialEligible };
}

function ctaLabel(trialEligible: boolean): string {
  return trialEligible ? `Try Pro free for ${TRIAL_DAYS} days` : "See plans";
}

// ── Banner ────────────────────────────────────────────────────────────────────

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(BANNER_DISMISSED_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function WatermarkUpgradeBanner() {
  const { isFree, trialEligible } = useFreeTierState();
  const openPlans = useOpenPlans();
  // The server snapshot says "snoozed": localStorage isn't readable during
  // SSR, and a banner that flashes then vanishes for someone who snoozed it is
  // worse than one that appears a tick late.
  const storedSnooze = useSyncExternalStore(subscribeStorage, readSnoozed, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (!isFree || storedSnooze || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(BANNER_DISMISSED_KEY, String(Date.now() + BANNER_SNOOZE_MS)); } catch { /* private mode */ }
  }

  return (
    <section
      aria-label="Remove the watermark"
      className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">Post these without the watermark</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          Free clips carry a small Clipiro watermark and export at 720p.{" "}
          {trialEligible ? `Pro removes both — free for ${TRIAL_DAYS} days.` : "Any paid plan removes both."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="primary" size="sm" onClick={openPlans}>{ctaLabel(trialEligible)}</Button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Not now
        </button>
      </div>
    </section>
  );
}

// ── Download gate ─────────────────────────────────────────────────────────────

type GateClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;

const GateCtx = createContext<GateClick | null>(null);

/** onClick for a clip download link. Outside a provider (or for a paying
 *  user) it does nothing and the link downloads as usual. */
export function useWatermarkDownloadGate(): GateClick {
  return useContext(GateCtx) ?? noop;
}
function noop() {}

function startDownload(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The first download a free user starts in a browser session pauses on one
 * question — keep the watermark, or try Pro — and after that never again in
 * that session, whichever they pick.
 */
export function WatermarkDownloadGateProvider({ children }: { children: React.ReactNode }) {
  const { isFree, trialEligible } = useFreeTierState();
  const openPlans = useOpenPlans();
  const [pending, setPending] = useState<string | null>(null);

  const markSeen = () => {
    try { sessionStorage.setItem(GATE_SEEN_KEY, "1"); } catch { /* private mode: may ask again */ }
  };

  const gate = useCallback<GateClick>((e, href) => {
    if (!isFree) return;
    try {
      if (sessionStorage.getItem(GATE_SEEN_KEY) === "1") return;
    } catch {
      return; // no storage: never risk asking on every click
    }
    e.preventDefault();
    setPending(href);
  }, [isFree]);

  return (
    <GateCtx.Provider value={gate}>
      {children}
      <Modal open={pending !== null} onClose={() => setPending(null)} title="Download with the watermark?" maxWidth="max-w-sm">
        <p className="text-sm text-fg-muted">
          Free clips carry a small Clipiro watermark and export at 720p.{" "}
          {trialEligible
            ? `Pro removes both, and you can try it free for ${TRIAL_DAYS} days.`
            : "Any paid plan removes both."}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const href = pending;
              markSeen();
              setPending(null);
              if (href) startDownload(href);
            }}
          >
            Download anyway
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              markSeen();
              setPending(null);
              openPlans();
            }}
          >
            {ctaLabel(trialEligible)}
          </Button>
        </div>
      </Modal>
    </GateCtx.Provider>
  );
}
