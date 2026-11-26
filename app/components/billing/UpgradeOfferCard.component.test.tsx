// @vitest-environment jsdom
//
// The offer at a limit: a free account that can still take the trial gets the
// trial and the ₹199 First Pack, one click each; a paying account gets a plain
// Upgrade; every sighting and click is reported against its placement.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TRIAL_DAYS } from "@/lib/plans/tiers";
import { ENTRY_PACK_MINUTES, ENTRY_PACK_SLUG } from "@/lib/conversion";

let user: { tier: string; trialUsedAt: string | null; hasPurchased?: boolean; subscriptionCurrency?: string | null } | null;
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ user }) }));
const openOffer = vi.fn();
const openPlans = vi.fn();
vi.mock("@/app/components/billing/BillingOverlayContext", () => ({
  useOpenOffer: () => openOffer,
  useOpenPlans: () => openPlans,
}));
const tracked: unknown[] = [];
vi.mock("@/app/components/billing/trackFunnel", () => ({
  trackFunnel: (e: unknown) => tracked.push(e),
  useTrackShown: (placement: string, visible: boolean, offer?: string) => {
    if (visible) tracked.push({ type: "upgrade_prompt", placement, action: "shown", offer });
  },
}));

const { UpgradeOfferCard } = await import("./UpgradeOfferCard");

beforeEach(() => {
  user = { tier: "free", trialUsedAt: null, hasPurchased: false, subscriptionCurrency: "INR" };
  openOffer.mockClear();
  openPlans.mockClear();
  tracked.length = 0;
});

describe("UpgradeOfferCard", () => {
  it("offers a free account the trial and the First Pack, one click each", async () => {
    render(<UpgradeOfferCard placement="file_limit" title="Too big" body="This file is 1.4 GB." />);
    await userEvent.click(screen.getByRole("button", { name: `Start ${TRIAL_DAYS}-day Pro trial` }));
    expect(openOffer).toHaveBeenCalledWith({ intent: "trial" });
    await userEvent.click(screen.getByRole("button", { name: `${ENTRY_PACK_MINUTES} minutes for ₹199` }));
    expect(openOffer).toHaveBeenCalledWith({ intent: "pack", packSlug: ENTRY_PACK_SLUG });
    expect(tracked).toContainEqual({ type: "upgrade_prompt", placement: "file_limit", action: "shown", offer: "trial" });
    expect(tracked).toContainEqual({ type: "upgrade_prompt", placement: "file_limit", action: "clicked", offer: "trial" });
  });

  it("after a trial, still offers the pack but not the trial", () => {
    user = { tier: "free", trialUsedAt: "2026-11-01", hasPurchased: false };
    render(<UpgradeOfferCard placement="low_minutes" title="Low" body="x" />);
    expect(screen.queryByRole("button", { name: /Pro trial/ })).toBeNull();
    expect(screen.getByRole("button", { name: "See plans" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /minutes for/ })).toBeTruthy();
  });

  it("gives a paying account a plain Upgrade", async () => {
    user = { tier: "creator", trialUsedAt: null, hasPurchased: true };
    render(<UpgradeOfferCard placement="file_limit" title="Too big" body="x" />);
    expect(screen.queryByRole("button", { name: /minutes for/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(openPlans).toHaveBeenCalled();
  });

  it("shows a way round the limit when given one", async () => {
    const alt = vi.fn();
    render(<UpgradeOfferCard placement="file_limit" title="Too big" body="x" alternative={{ label: "Paste a link instead", onClick: alt }} />);
    await userEvent.click(screen.getByRole("button", { name: "Paste a link instead" }));
    expect(alt).toHaveBeenCalled();
  });
});
