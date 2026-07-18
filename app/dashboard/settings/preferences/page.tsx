// Only one real preference exists today (interface language), and it's not
// wired to anything yet — an honest disabled row rather than a fake working
// selector. Relocated from the top-right popover, which used to carry this
// as a dead menu item instead of a real settings page.

import { Card } from "@/app/components/ui/Card";

function IcGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}

export default function PreferencesPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Preferences</h1>
        <p className="text-sm text-ink-soft mt-1">Display and locale preferences for your account.</p>
      </div>

      <Card padding="none">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-tint-blue text-brand flex items-center justify-center flex-shrink-0"><IcGlobe /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Language</p>
              <p className="text-xs text-ink-soft mt-0.5">The language Clipiro&apos;s interface is displayed in.</p>
            </div>
          </div>
          <span
            title="Coming soon"
            className="flex-shrink-0 text-xs font-semibold text-ink-soft/60 bg-gray-50 border border-card-border rounded-full px-3 py-1.5 cursor-not-allowed"
          >
            English (US)
          </span>
        </div>
      </Card>
    </div>
  );
}
