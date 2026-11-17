"use client";

// The one bar every Social view shares: which account, which period, how
// fresh the numbers are, and the three things people come here to DO —
// download, post, and change settings. It replaces the old sticky filter bar,
// the quick-actions rail and the per-tab export buttons.
//
// State lives in the URL (?account=, ?range=), so a view is shareable and Back
// undoes a filter change.

import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { useToast } from "@/app/components/ui/Toast";
import { DownloadMenu } from "./DownloadMenu";
import { useSocialApi, type SocialApiError } from "./useSocialApi";

export const RANGES = [7, 30, 90, 365] as const;
const RANGE_LABEL: Record<number, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "12 months" };
const ROOT = "/dashboard/social-tracker";

export interface HeaderAccount {
  id: string;
  label: string;
  provider: string;
  status: string;
  lastSyncStatus: string;
  /** "8h ago", worked out on the server so the first paint matches. */
  syncedAgo: string | null;
}

export function TrackerHeader({ accounts }: { accounts: HeaderAccount[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const api = useSocialApi();
  const { showToast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const onOverview = pathname === ROOT;
  const onPosts = pathname.startsWith(`${ROOT}/posts`);
  const main = onOverview || onPosts;

  const account = params.get("account");
  const range = Number(params.get("range") ?? 30);
  const scoped = account && account !== "all" ? accounts.filter((a) => a.id === account) : accounts;
  const inView = scoped.length > 0 ? scoped : accounts;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    const results = await Promise.all(
      inView.map((a) =>
        api(`/api/social/accounts/${a.id}`, { method: "POST" })
          .then(() => "ok" as const)
          .catch((e: SocialApiError) => (e.status === 429 ? ("cooldown" as const) : ("failed" as const))),
      ),
    );
    setSyncing(false);
    if (results.every((r) => r === "cooldown")) {
      showToast("Refreshed a few minutes ago. Try again shortly.", "info");
    } else if (results.includes("failed")) {
      showToast("Some accounts couldn't refresh. They'll try again on the next scheduled sync.", "error");
    } else {
      showToast("Refreshing. New numbers appear as each platform answers.", "success");
    }
    router.refresh();
  }, [api, inView, router, showToast]);

  const broken = inView.find((a) => a.status === "needs_reauth" || a.status === "revoked");
  const failed = inView.find((a) => a.lastSyncStatus === "failed");
  // The oldest sync in view is the honest one to show: "8h ago" means nothing
  // in view is staler than that.
  const synced = inView.map((a) => a.syncedAgo).find((s) => s !== null) ?? null;
  const newPostHref = account && account !== "all" ? `${ROOT}/new?account=${encodeURIComponent(account)}` : `${ROOT}/new`;

  return (
    <header className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-xl font-bold text-fg">
          {main ? "Social Tracker" : <Link href={ROOT} prefetch={false} className="hover:text-brand">← Social Tracker</Link>}
        </h1>

        {main && accounts.length > 1 && (
          <label className="flex items-center">
            <span className="sr-only">Account</span>
            <select
              value={account && account !== "all" ? account : ""}
              onChange={(e) => setParam("account", e.target.value || null)}
              className="max-w-[14rem] rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {onOverview && accounts.length > 0 && (
          <div role="group" aria-label="Date range" className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setParam("range", r === 30 ? null : String(r))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  range === r ? "bg-brand text-on-primary" : "border border-line bg-panel text-fg-muted hover:text-fg"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {main && accounts.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              {broken ? (
                <Link href={`${ROOT}/settings`} prefetch={false} className="font-semibold text-error hover:underline">
                  Reconnect {broken.label}
                </Link>
              ) : failed ? (
                <span className="font-semibold text-warning">Last sync failed</span>
              ) : (
                <span>{synced ? `Synced ${synced}` : "Not synced yet"}</span>
              )}
              <button
                type="button"
                onClick={() => void sync()}
                disabled={syncing}
                aria-label="Refresh numbers now"
                title="Refresh numbers now"
                className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className={syncing ? "animate-spin" : ""}
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
                  <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </span>
          )}

          {main && accounts.length > 0 && (
            <DownloadMenu accounts={inView.map((a) => ({ id: a.id, label: a.label }))} range={range} />
          )}

          {main && (
            <Link
              href={`${ROOT}/settings`}
              prefetch={false}
              aria-label="Accounts and settings"
              title="Accounts and settings"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          )}

          {main && accounts.length > 0 && (
            <Button size="sm" href={newPostHref} prefetch={false}>
              + New post
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
