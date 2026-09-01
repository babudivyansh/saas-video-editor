"use client";

// "Manage plan" used to open PlansModal — i.e. the *buy* flow — so there was no
// surface anywhere for managing an existing subscription. This is that surface.
//
// It renders bare, with no dialog chrome of its own: BillingOverlay shows it as
// one of three swappable views. It was previously a right-hand slide-over, but
// once billing itself became an overlay that would have meant a dialog on top
// of a dialog — three layers deep once Change plan opened, which is
// unescapable on a phone.

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import { formatMoney, type Currency } from "@/lib/currency-shared";
import type { AuthUser } from "@/app/components/useAuthUser";

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string } | null;
}

interface Props {
  user: AuthUser | null;
  token: string | null;
  purchases: Purchase[];
  /** Swaps the overlay to the Plans view — switching plans is still a purchase. */
  onChangePlan: () => void;
  onCancelClick: () => void;
  onResumed: () => void;
  /** The viewer's selected currency, so this agrees with the plan cards. */
  currency?: Currency;
}

function formatDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-card-border last:border-0">
      <span className="text-xs text-ink-soft flex-shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-right ${muted ? "text-ink-soft" : "text-ink"}`}>{value}</span>
    </div>
  );
}

export function ManageSubscriptionPanel({
  user, token, purchases, onChangePlan, onCancelClick, onResumed, currency = "INR",
}: Props) {
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeNeedsNewPlan, setResumeNeedsNewPlan] = useState(false);

  const cancelled = !!user?.subscriptionCancelledAt;
  const endsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  // "Recurring" means an actual Razorpay mandate, not merely having a plan: a
  // legacy prepaid term lapses instead of renewing, so it has no next charge.
  const recurring = !!user?.razorpaySubscriptionId && !!endsAt;
  const priceMinor = currency === "USD"
    ? (user?.plan?.usdPriceInCents ?? 0)
    : (user?.plan?.priceInPaise ?? 0);

  async function resume() {
    setResuming(true);
    setResumeError(null);
    setResumeNeedsNewPlan(false);
    try {
      const res = await fetch("/api/billing/resume", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResumeError(data.error ?? "Couldn't turn renewal back on.");
        setResumeNeedsNewPlan(!!data.requiresNewSubscription);
        return;
      }
      onResumed();
    } catch {
      setResumeError("Couldn't turn renewal back on. Please try again.");
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="space-y-6">
        {/* ── Current plan ── */}
        <section>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-bold text-ink">{user?.plan?.name ?? "Subscription"}</span>
            {cancelled ? (
              <span className="bg-gray-100 text-ink-soft text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Cancelling
              </span>
            ) : (
              <span className="bg-tint-emerald text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Active
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-card-border px-4 py-1">
            <Row label="Monthly credits" value={user?.monthlyCredits || "—"} />
            <Row
              label={cancelled ? "Access until" : "Renews on"}
              value={endsAt ? formatDate(endsAt) : "—"}
            />
            <Row
              label="Next charge"
              value={
                cancelled ? "None — cancelled"
                  : !recurring ? "None — access ends on the date above"
                  : priceMinor ? formatMoney(priceMinor, currency)
                  : "—"
              }
              muted={cancelled || !recurring}
            />
            <Row label="Next credit refill" value={user?.nextRefillAt ? formatDate(user.nextRefillAt) : "—"} />
            <Row
              label="Payment method"
              value={<span className="text-ink-soft font-normal">Managed by Razorpay</span>}
            />
          </div>
        </section>

        {/* ── Actions ── */}
        <section className="space-y-2.5">
          <Button variant="primary" size="lg" onClick={onChangePlan} className="w-full">
            Change plan
          </Button>

          {cancelled ? (
            <>
              <Button variant="secondary" size="lg" onClick={resume} disabled={resuming} className="w-full">
                {resuming ? "Turning renewal on…" : "Resume subscription"}
              </Button>
              {resumeError && (
                <div role="alert" className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5">
                  <p className="text-xs text-amber-900">{resumeError}</p>
                  {resumeNeedsNewPlan && (
                    <button
                      onClick={onChangePlan}
                      className="text-xs font-bold text-brand hover:text-brand-dark mt-1.5 cursor-pointer"
                    >
                      Choose a plan →
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <button
              onClick={onCancelClick}
              className="w-full text-center text-xs text-ink-soft/70 hover:text-red-600 font-medium transition-colors cursor-pointer py-2"
            >
              Cancel subscription
            </button>
          )}

          {cancelled && endsAt && (
            <p className="text-xs text-ink-soft/70 text-center">
              Your plan and credits stay available until {formatDate(endsAt)}.
            </p>
          )}
        </section>

        {/* ── Billing history ── */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-2.5">Billing history</h3>
          {purchases.length === 0 ? (
            <p className="text-xs text-ink-soft/70 py-3">No payments yet.</p>
          ) : (
            <ul className="rounded-2xl border border-card-border divide-y divide-card-border">
              {purchases.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{p.plan?.name ?? "Credits"}</p>
                    <p className="text-[11px] text-ink-soft">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-semibold text-ink">{formatMoney(p.amountInPaise, "INR")}</span>
                    <Link
                      href={`/dashboard/profile/receipt/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View receipt for ${p.plan?.name ?? "credits"} on ${formatDate(p.createdAt)} (opens in a new tab)`}
                      className="text-ink-soft/60 hover:text-brand transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {purchases.length > 6 && (
            <p className="text-[11px] text-ink-soft/70 mt-2">
              Showing the 6 most recent — the Payment History tab has them all.
            </p>
          )}
        </section>

        {recurring && (
          <p className="text-[11px] text-ink-soft/60 leading-relaxed">
            Changing plan starts a fresh term from that day rather than pro-rating the current one. Credits already in
            your account carry over.
          </p>
        )}
    </div>
  );
}
