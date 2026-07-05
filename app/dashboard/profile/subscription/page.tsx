"use client";

// Relocated from the old profile page's hero + "Plan & Credits" panel's
// plan-facts half. No new fetches — everything comes from useAuth().

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

function IcZap() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>; }
function IcRefresh() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>; }
function IcCalendar() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

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
        <h1 className="text-xl font-bold text-gray-900">Subscription</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(expiringSoon || !hasActivePlan) && (
            <Link href="/pricing"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
              <IcRefresh /> {hasActivePlan ? "Renew" : "Subscribe"}
            </Link>
          )}
          <Link href="/pricing"
            className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            <IcZap /> Upgrade
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{planName}</span>
          {user?.veo3Enabled ? (
            <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">✦ Veo3 enabled</span>
          ) : (
            <span className="text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Veo3 not included</span>
          )}
          <span className="text-xs text-gray-400">Member since {memberSince}</span>
        </div>

        {hasActivePlan ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Monthly credits</p>
                <p className="text-lg font-bold text-gray-900">{monthlyCredits || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Renews / expires</p>
                <p className="text-lg font-bold text-gray-900">{endsAt ? formatDate(endsAt.toISOString()) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Next refill</p>
                <p className="text-lg font-bold text-gray-900">{user?.nextRefillAt ? formatDate(user.nextRefillAt) : "—"}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-semibold flex items-center gap-1 ${expiringSoon ? "text-amber-600" : "text-gray-500"}`}>
                  <IcCalendar /> {daysLeft} day{daysLeft === 1 ? "" : "s"} left in term
                </span>
                {expiringSoon && (
                  <Link href="/pricing" className="font-bold text-blue-600 hover:underline">Renew now →</Link>
                )}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${expiringSoon ? "bg-amber-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.max(4, Math.min(100, (daysLeft / 30) * 100))}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">No active subscription</p>
              <p className="text-xs text-gray-500 mt-0.5">Subscribe to get monthly credits and unlock top-up packs.</p>
            </div>
            <Link href="/pricing"
              className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              <IcZap /> View plans
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
