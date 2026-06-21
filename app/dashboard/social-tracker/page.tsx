"use client";

import { useState } from "react";
import ToolsSidebar from "@/app/components/ToolsSidebar";

const PLATFORMS = [
  {
    id: "tiktok",
    name: "TikTok",
    color: "#010101",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
      </svg>
    ),
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#ff0000",
    bg: "#fff1f2",
    border: "#fecdd3",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 00.5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 002.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 002.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.86 12l-6.11 3.52z"/>
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    color: "#e1306c",
    bg: "#fdf2f8",
    border: "#f9a8d4",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    color: "#000000",
    bg: "#f8fafc",
    border: "#e2e8f0",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
];

export default function SocialTrackerPage() {
  const [toastId, setToastId] = useState<string | null>(null);

  function handleConnect(id: string) {
    setToastId(id);
    setTimeout(() => setToastId(null), 2500);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="social" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Social Tracker</h1>
              <p className="text-sm text-gray-500">Connect your accounts to monitor growth and analytics</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 max-w-4xl w-full mx-auto">

          {/* Platform grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {PLATFORMS.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: p.bg, color: p.color }}
                  >
                    {p.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">Not connected</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
                    —
                  </span>
                </div>

                {/* Stats placeholders */}
                <div className="grid grid-cols-3 gap-2">
                  {["Followers", "Views", "Likes"].map(stat => (
                    <div key={stat} className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">{stat}</p>
                      <p className="text-sm font-bold text-gray-300">—</p>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <button
                    onClick={() => handleConnect(p.id)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 transition-all"
                    style={{ borderColor: p.border, color: p.color, background: p.bg }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  >
                    Connect {p.name}
                  </button>
                  {toastId === p.id && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg">
                      Coming soon ✨
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Coming Soon banner */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-2">Full Analytics Dashboard — Coming Soon</h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Track views, followers, and engagement across all your social platforms in one place. Connect your accounts now to be the first to access it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
