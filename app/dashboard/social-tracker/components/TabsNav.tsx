"use client";

// Top-level navigation: Overview and Posts.
//
// These are LINKS, not ARIA tabs: separate routes give deep links, a working
// Back button, and per-view streaming and error boundaries. Settings and the
// composer are reached from the header, not from here.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/posts", label: "Posts" },
] as const;

const ROOT = "/dashboard/social-tracker";

export function TabsNav({ needsYou = 0 }: { needsYou?: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // The account and range carry across tabs; the Posts view filter does not.
  const carry = new URLSearchParams();
  for (const key of ["account", "range"]) {
    const v = params.get(key);
    if (v) carry.set(key, v);
  }
  const qs = carry.toString();

  // Settings and the composer are pages of their own, reached from the header.
  if (pathname !== ROOT && !pathname.startsWith(`${ROOT}/posts`)) return null;

  return (
    <nav aria-label="Social sections" className="mb-5 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const href = `${ROOT}${tab.href}`;
          const active = tab.href === "" ? pathname === ROOT : pathname.startsWith(href);
          return (
            <li key={tab.href}>
              <Link
                href={qs ? `${href}?${qs}` : href}
                // Off on purpose: these are force-dynamic, database-backed
                // routes, and a prefetch burst on every load came back 503 in
                // production. Each tab has a shaped loading.tsx instead.
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active ? "border-brand text-brand" : "border-transparent text-fg-muted hover:text-fg"
                }`}
              >
                {tab.label}
                {tab.href === "/posts" && needsYou > 0 && (
                  <span className="rounded-full bg-tint-amber px-1.5 py-0.5 text-[10px] font-bold text-warning">
                    {needsYou}
                    <span className="sr-only"> need you</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
