"use client";

// Sticky global filters.
//
// State lives in the URL, not in React. That makes any view shareable, survives
// a reload, and — unlike the old range switcher, which used history.replaceState
// — makes the browser Back button undo a filter change, which is what users
// expect it to do.

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

const RANGE_LABEL: Record<RangeDays, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "12 months",
};

const GRANULARITIES = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export interface AccountChip {
  id: string;
  label: string;
  provider: string;
}

const ROOT = "/dashboard/social-tracker";

/**
 * Which controls each tab actually reads.
 *
 * The bar is rendered by the shared layout, so it used to appear in full on
 * every tab — including Settings, Reports and Competitors, none of which look at
 * a date range. A control that visibly does nothing teaches people to distrust
 * the ones that do.
 */
function controlsFor(pathname: string): { account: boolean; range: boolean; granularity: boolean } {
  const tab = pathname.startsWith(`${ROOT}/`) ? pathname.slice(ROOT.length + 1).split("/")[0] : "";
  switch (tab) {
    case "":
      return { account: true, range: true, granularity: true };
    case "content":
      return { account: true, range: true, granularity: false };
    case "audience":
      return { account: true, range: false, granularity: false };
    // competitors / reports / settings act on every connected account and have
    // no time axis at all.
    default:
      return { account: false, range: false, granularity: false };
  }
}

export function FilterBar({ accounts }: { accounts: AccountChip[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const range = Number(params.get("range") ?? 30);
  const granularity = params.get("granularity") ?? "day";
  const account = params.get("account");
  const show = controlsFor(pathname);
  const current = account && account !== "all" ? accounts.find((a) => a.id === account) : null;

  /** Merge into the query string, dropping empty values so URLs stay readable. */
  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      // push, not replace: Back should undo a filter change.
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Nothing on this tab is filterable — render no bar at all rather than an
  // empty sticky strip.
  if (!show.account && !show.range && !show.granularity) return null;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-card-border bg-bg/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/*
          An account SWITCHER, not a set of filters. The tracker is scoped to one
          account at a time, so the question here is "which one am I looking at",
          which a select answers in one control — and it keeps working when the
          user has ten accounts, where a row of pills would wrap into a wall.
        */}
        {show.account && accounts.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span className="sr-only">Account</span>
              <select
                value={account ?? ""}
                onChange={(e) => setParam({ account: e.target.value || null })}
                className="max-w-[13rem] rounded-lg border border-card-border bg-panel px-2 py-1 text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {/* The empty value is the picker, so "back to my accounts" is
                    reachable from inside any tab without using Back. */}
                <option value="">Choose an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
                <option value="all">All accounts (compare)</option>
              </select>
            </label>
            {current && (
              <span className="hidden text-xs text-ink-soft sm:inline">
                Showing {current.label}
              </span>
            )}
          </div>
        )}

        {show.range && (
          <div role="group" aria-label="Date range" className="flex items-center gap-1">
            {RANGES.map((r) => (
              <Chip key={r} active={range === r} onClick={() => setParam({ range: String(r) })}>
                {RANGE_LABEL[r]}
              </Chip>
            ))}
          </div>
        )}

        {show.granularity && (
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span>Group by</span>
            <select
              value={granularity}
              onChange={(e) => setParam({ granularity: e.target.value === "day" ? null : e.target.value })}
              className="rounded-lg border border-card-border bg-panel px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {GRANULARITIES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/*
          "Compare to previous period" lived here and was wired to nothing. The
          param was parsed in shared.ts and unit-tested, but no page ever read
          it, so the box was pure decoration — and redundant besides, since every
          KPI tile already carries its period-over-period delta unconditionally.
          Removed rather than wired: there is no second behaviour to switch to.
        */}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-pressed, not aria-selected: these are toggle buttons, not tabs.
      aria-pressed={active}
      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
        active
          ? "bg-brand text-on-primary"
          : "border border-card-border bg-panel text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
