"use client";

import { useState } from "react";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { useAuth } from "@/app/components/AuthContext";

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
    desc: "Your friend creates a Clipiro account using your referral link — it takes less than a minute.",
    color: "#f0fdf4",
    textColor: "#16a34a",
  },
  {
    num: "3",
    title: "You earn credits",
    desc: "When your friend subscribes to any plan, you automatically receive +10 credits in your account.",
    color: "#fefce8",
    textColor: "#ca8a04",
  },
];

const STATS = [
  { label: "Credits Earned", value: "0" },
  { label: "Friends Referred", value: "0" },
  { label: "Pending", value: "0" },
];

export default function ReferralPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://clipiro.com";
  const referralLink = user ? `${baseUrl}/signup?ref=${user.id}` : `${baseUrl}/signup`;

  function handleCopy() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="earn" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-gray-50">
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
              <h1 className="text-lg font-bold text-gray-900">Earn Credits</h1>
              <p className="text-sm text-gray-500">Invite friends and earn free credits for every subscription</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 max-w-3xl w-full mx-auto space-y-6">

          {/* Hero card */}
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
            <h2 className="text-2xl font-extrabold mb-2">Invite friends, earn free credits</h2>
            <p className="text-blue-100 text-sm max-w-sm mx-auto">
              For every friend who subscribes to Clipiro, you get <strong className="text-white">+10 free credits</strong> — automatically, no limits.
            </p>
          </div>

          {/* Referral link box */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-3">Your referral link</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 font-mono truncate select-all">
                {referralLink}
              </div>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-5 text-center shadow-sm">
                <p className="text-2xl font-extrabold text-gray-800 mb-1">{stat.value}</p>
                <p className="text-xs text-gray-400 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>

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

          {/* Fine print */}
          <p className="text-xs text-gray-400 text-center pb-4">
            Credits are added automatically after your friend&apos;s first payment clears. Referral stats update within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
