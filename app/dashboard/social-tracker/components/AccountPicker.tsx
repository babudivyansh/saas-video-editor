// The landing surface: which account do you want to look at?
//
// The tracker used to open on combined "All accounts" numbers, which answers a
// question most people are not asking first. You almost always arrive thinking
// about ONE account; the portfolio view is the follow-up, not the entry point.
// So it is still here, one click away, but it is no longer what you land on.
//
// Each card carries enough to choose without opening it: size, how it is doing,
// and — the part the old view hid — whether the numbers can be trusted right
// now, because an account that failed to sync is worse than useless if you
// don't know it failed.

import Link from "next/link";
import type { AccountContext } from "@/lib/social/queries";
import { fmtCompact } from "@/app/components/charts/format";
import { accountLabel } from "../shared";

const PLATFORM: Record<string, { name: string; color: string; bg: string }> = {
  youtube: { name: "YouTube", color: "#ff0000", bg: "#ffe8e8" },
  instagram: { name: "Instagram", color: "#e1306c", bg: "#ffe8f1" },
  facebook: { name: "Facebook", color: "#1877f2", bg: "#e8f0ff" },
};

export interface AccountPickerProps {
  accounts: AccountContext[];
  /** Carried through so choosing an account keeps the range/granularity. */
  query?: string;
}

export function AccountPicker({ accounts, query = "" }: AccountPickerProps) {
  const href = (account: string) => {
    const params = new URLSearchParams(query);
    params.set("account", account);
    return `/dashboard/social-tracker?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink">Your accounts</h2>
        <p className="text-sm text-ink-soft">Pick one to see its analytics.</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => {
          const meta = PLATFORM[account.provider] ?? {
            name: account.provider,
            color: "#64748b",
            bg: "#f1f5f9",
          };
          return (
            <li key={account.id}>
              <Link
                href={href(account.id)}
                className="group flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="flex items-center gap-3">
                  {account.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={account.avatarUrl}
                      alt=""
                      className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.name[0]}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink group-hover:text-brand">
                      {accountLabel(account)}
                    </p>
                    <p className="text-xs text-ink-soft">{meta.name}</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-4">
                  <Stat label="Followers" value={fmtCompact(account.followers)} />
                  <Stat
                    label="Health"
                    value={account.healthScore === null ? "—" : account.healthScore.toFixed(0)}
                  />
                </div>

                <SyncLine account={account} />
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href={`/dashboard/social-tracker?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), account: "all" }).toString()}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        Compare all accounts
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-extrabold text-ink">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}

/**
 * Sync state, in words.
 *
 * A stale or partial sync is the difference between "engagement fell" and "we
 * failed to fetch engagement", and the card is where that has to be said —
 * after you have clicked in, every number already looks authoritative.
 */
function SyncLine({ account }: { account: AccountContext }) {
  if (account.status === "needs_reauth") {
    return (
      <p className="mt-auto text-xs font-semibold text-amber-700">
        Reconnect needed — analytics are paused
      </p>
    );
  }
  if (account.lastSyncStatus === "partial") {
    return <p className="mt-auto text-xs text-amber-700">Last sync was incomplete</p>;
  }
  if (account.lastSyncStatus && account.lastSyncStatus !== "ok") {
    return <p className="mt-auto text-xs text-red-600">Last sync failed</p>;
  }
  return (
    <p className="mt-auto text-xs text-ink-soft">
      {account.lastSyncedAt ? `Synced ${timeAgo(account.lastSyncedAt)}` : "Not synced yet"}
    </p>
  );
}

function timeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
