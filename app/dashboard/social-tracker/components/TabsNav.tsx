"use client";

// Top-level navigation.
//
// These are LINKS, not ARIA tabs. The old panel used role="tablist" with
// role="tab" buttons that had no tabpanel, no aria-controls and no roving
// tabindex — a partial ARIA contract, which is worse than none, because a screen
// reader announces four tabs that control nothing.
//
// They are also genuinely navigation: separate routes give deep links, a working
// Back button, and per-view streaming and error boundaries.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/content", label: "Content" },
  { href: "/audience", label: "Audience" },
  { href: "/competitors", label: "Competitors" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

const ROOT = "/dashboard/social-tracker";

export function TabsNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  // Filters are global, so carry them across tabs rather than resetting the
  // range every time the user changes view.
  const qs = params.toString();

  return (
    <nav aria-label="Social Tracker sections" className="mb-6 border-b border-card-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const href = `${ROOT}${tab.href}`;
          const active = tab.href === "" ? pathname === ROOT : pathname.startsWith(href);
          return (
            <li key={tab.href}>
              <Link
                href={qs ? `${href}?${qs}` : href}
                aria-current={active ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
