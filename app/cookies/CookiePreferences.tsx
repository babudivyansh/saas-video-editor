"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/app/components/ui/Switch";
import { Button } from "@/app/components/ui/Button";

const MARKETING_COOKIE = "cookie_consent_marketing";
// Read by app/components/analytics/WebVitals.tsx. The Analytics toggle used to
// be decoration: it was never saved, so turning it off changed nothing.
const ANALYTICS_COOKIE = "cookie_consent_analytics";

function readConsent(name: string): boolean {
  // Absence of the cookie (the overwhelming majority of visitors, who never
  // open this page) defaults to allowed, matching proxy.ts's own default.
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? match[1] !== "denied" : true;
}

function writeConsent(name: string, allowed: boolean) {
  document.cookie = `${name}=${allowed ? "granted" : "denied"}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
}

export default function CookiePreferences() {
  const [preferences, setPreferences] = useState({ analytics: true, marketing: true });
  const [isSaved, setIsSaved] = useState(false);

  // Reflect whatever was actually saved last time, rather than always
  // defaulting the toggles on every page load.
  useEffect(() => {
    setPreferences({ analytics: readConsent(ANALYTICS_COOKIE), marketing: readConsent(MARKETING_COOKIE) });
  }, []);

  const set = (type: "analytics" | "marketing", value: boolean) => {
    setPreferences((prev) => ({ ...prev, [type]: value }));
    setIsSaved(false);
  };

  const handleSave = () => {
    // Marketing: proxy.ts reads this to decide whether to set the affiliate
    // referral-tracking cookie, and track.ts to decide whether to send CTA
    // events. Analytics: WebVitals.tsx. A year is a reasonable horizon.
    writeConsent(MARKETING_COOKIE, preferences.marketing);
    writeConsent(ANALYTICS_COOKIE, preferences.analytics);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="my-8 rounded-[24px] border border-line bg-surface-1 p-6 sm:p-8">
      <h3 className="text-lg font-bold text-fg mb-4">Manage Cookie Preferences</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Strictly Necessary Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Required for account authorization, security, and payment integrations.</p>
          </div>
          <span className="inline-flex flex-shrink-0 items-center rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-fg-muted">
            Always Active
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Performance & Analytics Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Anonymous page-speed measurements that help us keep Clipiro fast.</p>
          </div>
          <Switch
            checked={preferences.analytics}
            onChange={(v) => set("analytics", v)}
            label="Performance and analytics cookies"
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-line bg-panel">
          <div>
            <p className="text-sm font-bold text-fg">Marketing & Targeting Cookies</p>
            <p className="text-xs text-fg-muted mt-0.5">Used to track referral efficiency from our affiliate networks and promotional ads.</p>
          </div>
          <Switch
            checked={preferences.marketing}
            onChange={(v) => set("marketing", v)}
            label="Marketing and targeting cookies"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-fg-subtle">Your choice is saved in this browser for one year.</p>
        <div className="flex items-center gap-3">
          <span role="status" className="text-xs font-bold text-success flex items-center gap-1">
            {isSaved && (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Preferences saved
              </>
            )}
          </span>
          <Button type="button" onClick={handleSave}>Save Preferences</Button>
        </div>
      </div>
    </div>
  );
}
