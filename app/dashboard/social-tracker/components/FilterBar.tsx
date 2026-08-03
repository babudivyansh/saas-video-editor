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

export function FilterBar({ accounts }: { accounts: AccountChip[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const range = Number(params.get("range") ?? 30);
  const granularity = params.get("granularity") ?? "day";
  const compare = params.get("compare") === "previous";
  const selected = params.get("accounts")?.split(",").filter(Boolean) ?? [];

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

  const toggleAccount = (id: string) => {
    const next = selected.includes(id) ? selected.filter((a) => a !== id) : [...selected, id];
    setParam({ accounts: next.length === 0 || next.length === accounts.length ? null : next.join(",") });
  };

  const allSelected = selected.length === 0;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-card-border bg-white/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {accounts.length > 1 && (
          <div role="group" aria-label="Filter by account" className="flex flex-wrap items-center gap-1.5">
            <Chip active={allSelected} onClick={() => setParam({ accounts: null })}>
              All accounts
            </Chip>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                active={selected.includes(a.id)}
                onClick={() => toggleAccount(a.id)}
              >
                {a.label}
              </Chip>
            ))}
          </div>
        )}

        <div role="group" aria-label="Date range" className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Chip key={r} active={range === r} onClick={() => setParam({ range: String(r) })}>
              {RANGE_LABEL[r]}
            </Chip>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span>Group by</span>
          <select
            value={granularity}
            onChange={(e) => setParam({ granularity: e.target.value === "day" ? null : e.target.value })}
            className="rounded-lg border border-card-border bg-white px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {GRANULARITIES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setParam({ compare: e.target.checked ? "previous" : null })}
            className="h-3.5 w-3.5 rounded border-card-border text-brand focus:ring-brand"
          />
          Compare to previous period
        </label>
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
          ? "bg-brand text-white"
          : "border border-card-border bg-white text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
