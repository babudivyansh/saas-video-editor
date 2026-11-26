"use client";

// Home: the trial offer for a free account whose Clip Minutes are running out
// (conversion plan, 2026-11-26). Before this, a free user learned they were
// out only when a run was refused, and the refusal offered credits.
//
// Shown at LOW_MINUTES_OFFER_AT minutes or fewer, only once the account has
// made a run (a brand-new account at 15 isn't "low"), and snoozed for two days
// when dismissed.

import { useState, useSyncExternalStore } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { UpgradeOfferCard } from "@/app/components/billing/UpgradeOfferCard";
import { LOW_MINUTES_OFFER_AT } from "@/lib/conversion";
import { TRIAL_MINUTES } from "@/lib/plans/tiers";

const SNOOZE_KEY = "clipiro:low-minutes-offer-snoozed-until";
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function LowMinutesOffer({ hasRuns }: { hasRuns: boolean }) {
  const { user } = useAuth();
  // Server snapshot "snoozed": no flash of a banner that then disappears.
  const snoozed = useSyncExternalStore(subscribe, readSnoozed, () => true);
  const [dismissed, setDismissed] = useState(false);

  const minutes = user?.minutes ?? 0;
  if (!user || user.tier !== "free" || !hasRuns || minutes > LOW_MINUTES_OFFER_AT || snoozed || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* private mode */ }
  }

  return (
    <UpgradeOfferCard
      placement="low_minutes"
      title={minutes === 0 ? "You're out of free Clip Minutes" : `${minutes} free Clip ${minutes === 1 ? "Minute" : "Minutes"} left`}
      body={`A Pro trial adds ${TRIAL_MINUTES} minutes and takes the watermark off, or grab a small pack.`}
      onDismiss={dismiss}
    />
  );
}
