"use client";

import { useEffect, useState } from "react";

const CONSENT_COOKIE = "cookie_consent_marketing";

function readMarketingConsent(): boolean {
  // Absence of the cookie (the overwhelming majority of visitors, who never
  // open this page) defaults to allowed, matching proxy.ts's own default.
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return match ? match[1] !== "denied" : true;
}

export default function CookiePreferences() {
  const [preferences, setPreferences] = useState({
    essential: true,
    analytics: true,
    marketing: true,
  });
  const [isSaved, setIsSaved] = useState(false);

  // Reflect whatever was actually saved last time, rather than always
  // defaulting the toggle to off on every page load.
  useEffect(() => {
    setPreferences((prev) => ({ ...prev, marketing: readMarketingConsent() }));
  }, []);

  const handleToggle = (type: "analytics" | "marketing") => {
    setPreferences((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
    setIsSaved(false);
  };

  const handleSave = () => {
    // This is what proxy.ts actually reads to decide whether to set the
    // affiliate referral-tracking cookie — see the comment on this toggle
    // below. A year is a reasonable "remember my choice" horizon; nothing
    // else on this page depends on the value.
    document.cookie = `${CONSENT_COOKIE}=${preferences.marketing ? "granted" : "denied"}; path=/; max-age=${365 * 24 * 60 * 60}`;
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="my-8 rounded-[24px] border border-gray-150 bg-gray-50/50 p-6 sm:p-8">
      <h3 className="text-lg font-bold text-fg mb-4">Manage Cookie Preferences</h3>

      <div className="space-y-4">
        {/* Essential */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Strictly Necessary Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Required for account authorization, security, and payment integrations.</p>
          </div>
          <div>
            <span className="inline-flex items-center rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-fg-muted">
              Always Active
            </span>
          </div>
        </div>

        {/* Analytics */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Performance & Analytics Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Allows us to monitor traffic patterns, user flows, and editor performance metrics.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleToggle("analytics")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.analytics ? "bg-brand" : "bg-surface-3"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.analytics ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Marketing */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Marketing & Targeting Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Used to track referral efficiency from our affiliate networks and promotional ads.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleToggle("marketing")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.marketing ? "bg-brand" : "bg-surface-3"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.marketing ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-fg-subtle">Your choice is saved in this browser for one year.</p>
        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Preferences Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            className="rounded-full bg-brand px-6 py-2.5 text-xs font-bold text-on-primary shadow-md hover:bg-[#2348d8] transition-all cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
