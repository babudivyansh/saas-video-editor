"use client";

import { useState } from "react";

export default function CookiePreferences() {
  const [preferences, setPreferences] = useState({
    essential: true,
    analytics: true,
    marketing: false,
  });
  const [isSaved, setIsSaved] = useState(false);

  const handleToggle = (type: "analytics" | "marketing") => {
    setPreferences((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
    setIsSaved(false);
  };

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="my-8 rounded-[24px] border border-gray-150 bg-gray-50/50 p-6 sm:p-8">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Manage Cookie Preferences</h3>

      <div className="space-y-4">
        {/* Essential */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white">
          <div>
            <p className="text-sm font-bold text-gray-800">Strictly Necessary Cookies</p>
            <p className="text-xs text-gray-500 mt-0.5">Required for account authorization, security, and payment integrations.</p>
          </div>
          <div>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
              Always Active
            </span>
          </div>
        </div>

        {/* Analytics */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white">
          <div>
            <p className="text-sm font-bold text-gray-800">Performance & Analytics Cookies</p>
            <p className="text-xs text-gray-500 mt-0.5">Allows us to monitor traffic patterns, user flows, and editor performance metrics.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleToggle("analytics")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.analytics ? "bg-[#335CFF]" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.analytics ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Marketing */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white">
          <div>
            <p className="text-sm font-bold text-gray-800">Marketing & Targeting Cookies</p>
            <p className="text-xs text-gray-500 mt-0.5">Used to track referral efficiency from our affiliate networks and promotional ads.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleToggle("marketing")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.marketing ? "bg-[#335CFF]" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.marketing ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-gray-400">Values are stored in your local browser state.</p>
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
            className="rounded-full bg-[#335CFF] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2348d8] transition-all cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
