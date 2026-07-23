"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";

function IcGift() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
    </svg>
  );
}

interface AffiliateStats {
  enrolled: boolean;
  code?: string;
  referralLink?: string;
  totalReferrals?: number;
  convertedReferrals?: number;
  pendingAmount?: number;
  availableAmount?: number;
  totalEarned?: number;
  totalPaid?: number;
}

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

const STEPS = [
  {
    num: "1",
    title: "Share your link",
    desc: "Copy your unique referral link and share it with friends, on social media, or in your community.",
    color: "#eff6ff",
    textColor: "#2563eb",
  },
  {
    num: "2",
    title: "Friend signs up",
    desc: "Your friend creates a Clipiro account using your referral link — takes less than a minute.",
    color: "#f0fdf4",
    textColor: "#16a34a",
  },
  {
    num: "3",
    title: "You earn 20%",
    desc: "When your friend makes their first payment, you automatically receive 20% as affiliate commission.",
    color: "#fefce8",
    textColor: "#ca8a04",
  },
];

export default function ReferralPage() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [payoutRequesting, setPayoutRequesting] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState("");

  useEffect(() => {
    fetch("/api/affiliate/stats", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(setStats);
  }, []);

  async function handleJoin() {
    setJoining(true);
    const res = await fetch("/api/affiliate/join", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    setStats({ enrolled: true, ...data, totalReferrals: 0, convertedReferrals: 0, pendingAmount: 0, availableAmount: 0, totalEarned: 0, totalPaid: 0 });
    setJoining(false);
  }

  async function handlePayoutRequest() {
    setPayoutRequesting(true);
    const res = await fetch("/api/affiliate/payout-request", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    setPayoutMsg(data.error ?? `Payout request submitted for ₹${data.amount?.toFixed(2)}. Payouts are processed manually by our team, typically within a few business days.`);
    setPayoutRequesting(false);
  }

  function handleCopy() {
    if (!stats?.referralLink) return;
    navigator.clipboard.writeText(stats.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const referralLink = stats?.referralLink ?? "";
  const available = stats?.availableAmount ?? 0;

  return (
    <div className="flex flex-col min-w-0 h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <polyline points="20 12 20 22 4 22 4 12"/>
                <rect x="2" y="7" width="20" height="5"/>
                <line x1="12" y1="22" x2="12" y2="7"/>
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Affiliate Program</h1>
              <p className="text-sm text-gray-500">Earn 20% commission on every friend&apos;s first payment</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 max-w-3xl w-full mx-auto space-y-6">

          {/* Hero */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center shadow-lg">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <polyline points="20 12 20 22 4 22 4 12"/>
                <rect x="2" y="7" width="20" height="5"/>
                <line x1="12" y1="22" x2="12" y2="7"/>
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold mb-2">Earn 20% on every referral</h2>
            <p className="text-blue-100 text-sm max-w-sm mx-auto">
              Share your unique link. Every time a friend makes their first payment, you earn <strong className="text-white">20% commission</strong> — automatically, no limits.
            </p>
          </div>

          {/* Not enrolled yet */}
          {stats && !stats.enrolled && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <EmptyState
                icon={<IcGift />}
                title="You're not enrolled yet"
                subtitle="Join the affiliate program to get your unique referral link and start earning."
                action={{ label: joining ? "Setting up..." : "Join Affiliate Program", onClick: handleJoin, disabled: joining }}
              />
            </div>
          )}

          {/* Enrolled: referral link */}
          {stats?.enrolled && (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-3">Your referral link</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 font-mono truncate select-all">
                    {referralLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                      copied ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {copied ? (
                      <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                    ) : (
                      <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy Link</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">Code: <span className="font-mono font-semibold text-gray-600">{stats.code}</span></p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Referred", value: stats.totalReferrals ?? 0 },
                  { label: "Converted", value: stats.convertedReferrals ?? 0 },
                  { label: "Pending (₹)", value: `₹${(stats.pendingAmount ?? 0).toFixed(2)}` },
                  { label: "Available (₹)", value: `₹${(stats.availableAmount ?? 0).toFixed(2)}`, highlight: available >= MIN_PAYOUT_AMOUNT },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className={`bg-white rounded-2xl border p-5 text-center shadow-sm ${stat.highlight ? "border-green-300" : "border-gray-100"}`}
                  >
                    <p className={`text-2xl font-extrabold mb-1 ${stat.highlight ? "text-green-600" : "text-gray-800"}`}>{stat.value}</p>
                    <p className="text-xs text-gray-400 font-medium">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Payout section */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Request Payout</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Minimum ₹{MIN_PAYOUT_AMOUNT}. Payouts are processed manually, typically within a few business days of request.
                      {available < MIN_PAYOUT_AMOUNT && ` You need ₹${(MIN_PAYOUT_AMOUNT - available).toFixed(2)} more.`}
                    </p>
                  </div>
                  <button
                    onClick={handlePayoutRequest}
                    disabled={available < MIN_PAYOUT_AMOUNT || payoutRequesting}
                    className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {payoutRequesting ? "Requesting..." : `Request ₹${available.toFixed(2)}`}
                  </button>
                </div>
                {payoutMsg && (
                  <p className="text-sm mt-3 text-green-700 bg-green-50 rounded-lg px-4 py-2">{payoutMsg}</p>
                )}
              </div>
            </>
          )}

          {/* How it works */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-4">How it works</h3>
            <div className="flex flex-col gap-4">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0"
                    style={{ background: step.color, color: step.textColor }}
                  >
                    {step.num}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pb-4">
            Commissions are held for 30 days after payment before becoming available for payout. <a href="/affiliate-tos" className="underline">Full terms</a>
          </p>
        </div>
    </div>
  );
}
