"use client";

// Relocated from the old profile page's hero + "Plan & Credits" panel's
// plan-facts half. No new fetches — everything comes from useAuth().

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatTile } from "@/app/components/ui/StatTile";
import { formatDate } from "@/lib/format";

function IcZap() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>; }
function IcRefresh() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>; }
function IcCalendar() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>; }

function daysBetween(from: Date, to: Date) {
  return Math.ceil((+to - +from) / (1000 * 60 * 60 * 24));
}

export default function SubscriptionPage() {
  const { user } = useAuth();

  const planName = user?.plan?.name ?? "Free Plan";
  const memberSince = user?.createdAt ? formatDate(user.createdAt) : "—";
  const endsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  const hasActivePlan = !!endsAt && endsAt > new Date();
  const daysLeft = endsAt ? daysBetween(new Date(), endsAt) : 0;
  const expiringSoon = hasActivePlan && daysLeft <= 7;
  const monthlyCredits = user?.monthlyCredits ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-extrabold grad-text inline-block">Subscription</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(expiringSoon || !hasActivePlan) && (
            <Button variant="primary" size="md" href="/pricing">
              <IcRefresh /> {hasActivePlan ? "Renew" : "Subscribe"}
            </Button>
          )}
          <Button variant="secondary" size="md" href="/pricing">
            <IcZap /> Upgrade
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold bg-tint-blue text-brand px-2 py-0.5 rounded-full">{planName}</span>
          {user?.veo3Enabled ? (
            <span className="text-xs font-bold bg-tint-violet text-accent-violet px-2 py-0.5 rounded-full">✦ Veo3 enabled</span>
          ) : (
            <span className="text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Veo3 not included</span>
          )}
          <span className="text-xs text-ink-soft/70">Member since {memberSince}</span>
        </div>

        {hasActivePlan ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatTile label="Monthly credits" value={monthlyCredits || "—"} accent="blue" />
              <StatTile label="Renews / expires" value={endsAt ? formatDate(endsAt.toISOString()) : "—"} accent="violet" />
              <StatTile label="Next refill" value={user?.nextRefillAt ? formatDate(user.nextRefillAt) : "—"} accent="fuchsia" />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-semibold flex items-center gap-1 ${expiringSoon ? "text-amber-600" : "text-ink-soft"}`}>
                  <IcCalendar /> {daysLeft} day{daysLeft === 1 ? "" : "s"} left in term
                </span>
                {expiringSoon && (
                  <Link href="/pricing" className="font-bold text-brand hover:underline">Renew now →</Link>
                )}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${expiringSoon ? "bg-amber-500" : "grad-brand"}`}
                  style={{ width: `${Math.max(4, Math.min(100, (daysLeft / 30) * 100))}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <Card tint="violet" className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">No active subscription</p>
              <p className="text-xs text-ink-soft mt-0.5">Subscribe to get monthly credits and unlock top-up packs.</p>
            </div>
            <Button variant="primary" size="md" href="/pricing" className="flex-shrink-0">
              <IcZap /> View plans
            </Button>
          </Card>
        )}
      </Card>
    </div>
  );
}
