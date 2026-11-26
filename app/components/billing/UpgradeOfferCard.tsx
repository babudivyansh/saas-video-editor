"use client";

// The upgrade offer shown at a limit (conversion plan, 2026-11-26): a video
// too big or too long for the free plan, minutes running low, a run refused
// for minutes. Until now each of these was a line of red text, or a "Top up"
// that sent a free user to a credits tab. This card puts the two offers a
// free account can take in one click right where they hit the wall:
//
//   • Start 3-day Pro trial — straight to the trial's "₹0 due today" checkout
//   • 40 minutes for ₹199     — the once-per-account entry pack
//
// plus an optional way round the wall (e.g. "Paste a link instead").
//
// Paying accounts get a plain "See plans" instead: no trial, no entry pack.
// Every sighting and click is recorded against its placement
// (lib/conversion.ts), which is what Admin → Analytics reads.

import { useSyncExternalStore } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { inferCurrencyFromLocale } from "@/lib/currency-shared";
import { Button } from "@/app/components/ui/Button";
import { useOpenOffer, useOpenPlans } from "@/app/components/billing/BillingOverlayContext";
import { trackFunnel, useTrackShown } from "@/app/components/billing/trackFunnel";
import { ENTRY_PACK_INR, ENTRY_PACK_MINUTES, ENTRY_PACK_SLUG, ENTRY_PACK_USD_CENTS, type UpgradePlacement } from "@/lib/conversion";
import { TRIAL_DAYS, TRIAL_MINUTES } from "@/lib/plans/tiers";

export interface UpgradeOfferState {
  isFree: boolean;
  /** The Pro trial is still open: free, never trialled, never paid. */
  trialEligible: boolean;
  /** The ₹199 entry pack: offered to free accounts that have never paid. */
  entryPackEligible: boolean;
}

export function useUpgradeOfferState(): UpgradeOfferState {
  const { user } = useAuth();
  const isFree = !!user && user.tier === "free";
  const trialEligible = isFree && !user?.trialUsedAt && !user?.hasPurchased;
  return { isFree, trialEligible, entryPackEligible: isFree && !user?.hasPurchased };
}

interface Props {
  placement: UpgradePlacement;
  title: string;
  body: React.ReactNode;
  /** A way round the limit that isn't paying, e.g. "Paste a link instead". */
  alternative?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  /** Smaller padding and type, for lists such as the upload queue. */
  compact?: boolean;
}

/** "₹199" or "$2.99", in the currency the plans view will charge (the same
 *  locale guess PlansModal makes). Read after mount: navigator isn't there
 *  during SSR. */
const noSubscribe = () => () => {};
function useEntryPackPrice(): string {
  const { user } = useAuth();
  const subCurrency = user?.subscriptionCurrency ?? null;
  // The server snapshot is INR, the default currency.
  const usd = useSyncExternalStore(
    noSubscribe,
    () => (subCurrency ?? inferCurrencyFromLocale(navigator.language)) === "USD",
    () => false,
  );
  return usd ? `$${(ENTRY_PACK_USD_CENTS / 100).toFixed(2)}` : `₹${ENTRY_PACK_INR}`;
}

export function UpgradeOfferCard({ placement, title, body, alternative, onDismiss, compact = false }: Props) {
  const { isFree, trialEligible, entryPackEligible } = useUpgradeOfferState();
  const packPrice = useEntryPackPrice();
  const openOffer = useOpenOffer(placement);
  const openPlans = useOpenPlans(placement);
  const primaryOffer = trialEligible ? "trial" : entryPackEligible ? "pack" : "plans";
  useTrackShown(placement, true, primaryOffer);

  function trial() {
    trackFunnel({ type: "upgrade_prompt", placement, action: "clicked", offer: "trial" });
    openOffer({ intent: "trial" });
  }
  function pack() {
    trackFunnel({ type: "upgrade_prompt", placement, action: "clicked", offer: "pack" });
    openOffer({ intent: "pack", packSlug: ENTRY_PACK_SLUG });
  }
  function plans() {
    trackFunnel({ type: "upgrade_prompt", placement, action: "clicked", offer: "plans" });
    openPlans();
  }

  return (
    <section
      role="alert"
      aria-label={title}
      className={`rounded-2xl border border-primary/30 bg-primary/10 ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`${compact ? "text-[13px]" : "text-sm"} font-semibold text-fg`}>{title}</p>
          <div className={`mt-0.5 ${compact ? "text-xs" : "text-sm"} text-fg-muted`}>{body}</div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 rounded-lg px-1.5 text-fg-muted hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {trialEligible ? (
          <Button type="button" size="sm" onClick={trial}>
            Start {TRIAL_DAYS}-day Pro trial
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={plans}>
            {isFree ? "See plans" : "Upgrade"}
          </Button>
        )}
        {entryPackEligible && (
          <Button type="button" size="sm" variant="secondary" onClick={pack}>
            {ENTRY_PACK_MINUTES} minutes for {packPrice}
          </Button>
        )}
        {alternative && (
          <button
            type="button"
            onClick={alternative.onClick}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {alternative.label}
          </button>
        )}
      </div>
      {trialEligible && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          The trial includes {TRIAL_MINUTES} Clip Minutes, no watermark and 2 GB uploads. ₹0 today; cancel any time before it ends.
        </p>
      )}
    </section>
  );
}
