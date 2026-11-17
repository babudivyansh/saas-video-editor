// Social shell: one header bar (account, period, sync, Download, New post,
// settings) and two tabs (Overview, Posts).
//
// A Server Component: it reads the session cookie directly, so the first HTML
// response already carries the accounts and their sync state.

import { Suspense } from "react";
import { loadAccounts } from "@/lib/social/queries";
import { countNeedsYou } from "@/lib/social/posts-web";
import { ToastProvider } from "@/app/components/ui/Toast";
import { accountLabel, requireSubscriberOrRedirect } from "./shared";
import { TrackerHeader } from "./components/TrackerHeader";
import { TabsNav } from "./components/TabsNav";
import { TimezoneAutoSet } from "./components/TimezoneAutoSet";

export const dynamic = "force-dynamic";

/** Coarse relative time; a sync age only needs to be roughly right. */
function ago(at: Date | null, now: Date): string | null {
  if (!at) return null;
  const hours = Math.floor((now.getTime() - at.getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  // A visitor who can't be let in is routed by WHY: billing overlay if their
  // subscription lapsed, login if their session no longer resolves.
  const auth = await requireSubscriberOrRedirect();
  const now = new Date();
  const [accounts, needsYou] = await Promise.all([loadAccounts(auth.userId), countNeedsYou(auth.userId, now)]);

  // Oldest sync first, so the header's "Synced Xh ago" is the stalest in view.
  const header = [...accounts]
    .sort((a, b) => (a.lastSyncedAt?.getTime() ?? 0) - (b.lastSyncedAt?.getTime() ?? 0))
    .map((a) => ({
      id: a.id,
      label: accountLabel(a),
      provider: a.provider,
      status: a.status,
      lastSyncStatus: a.lastSyncStatus,
      syncedAgo: ago(a.lastSyncedAt, now),
    }));

  return (
    // ToastProvider is not mounted globally in this app, and useToast throws
    // without it.
    <ToastProvider>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
        {/* useSearchParams needs a Suspense boundary in a server-rendered tree. */}
        <Suspense fallback={<div className="mb-4 h-10 animate-pulse rounded-xl bg-surface-3" aria-label="Loading" />}>
          <TrackerHeader accounts={header} />
        </Suspense>
        {accounts.length > 0 && (
          <Suspense fallback={<div className="mb-5 h-10 animate-pulse rounded-xl bg-surface-3" aria-label="Loading" />}>
            <TabsNav needsYou={needsYou} />
          </Suspense>
        )}
        <TimezoneAutoSet accountIds={accounts.filter((a) => !a.timezone).map((a) => a.id)} />
        {children}
      </div>
    </ToastProvider>
  );
}
