// Social Tracker v2 shell.
//
// A Server Component: it reads the session cookie directly, so the KPI grid is
// in the first HTML response. The v1 page is a Client Component that renders
// nothing until JavaScript hydrates, reads a token out of localStorage, then
// fetches — four sequential hops before a single number appears.
//
// Lives under /v2 while the flag is off. Stage 10 promotes it to the parent
// route and deletes v1.

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireServerSubscriber } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/flags";
import { loadAccounts } from "@/lib/social/queries";
import { ToastProvider } from "@/app/components/ui/Toast";
import { FilterBar } from "../components/FilterBar";
import { TabsNav } from "../components/TabsNav";

export const dynamic = "force-dynamic";

export default async function SocialTrackerV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Flag resolved server-side — lib/flags.ts touches prisma and redis, so it
  // cannot be read from a Client Component.
  if (!(await isFeatureEnabled("social_tracker_v2"))) {
    redirect("/dashboard/social-tracker");
  }

  const auth = await requireServerSubscriber();
  if (!auth) redirect("/dashboard/social-tracker");

  const accounts = await loadAccounts(auth.userId);

  return (
    // ToastProvider is not mounted globally in this app (assets/page.tsx wraps
    // itself the same way), and useToast throws without it. Server-rendered
    // children pass straight through as a prop.
    <ToastProvider>
    <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grad-brand flex h-11 w-11 items-center justify-center rounded-2xl text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" strokeLinecap="round" />
              <path d="m7 14 4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-ink">Social Tracker</h1>
            <p className="text-xs text-ink-soft">
              {accounts.length === 0
                ? "Connect an account to start tracking"
                : `${accounts.length} connected ${accounts.length === 1 ? "account" : "accounts"}`}
            </p>
          </div>
        </div>
      </header>

      {/* useSearchParams needs a Suspense boundary in a server-rendered tree. */}
      <Suspense fallback={<div className="mb-6 h-12" />}>
        <TabsNav />
      </Suspense>

      {accounts.length > 0 && (
        <Suspense fallback={<div className="mb-6 h-14" />}>
          <FilterBar
            accounts={accounts.map((a) => ({
              id: a.id,
              provider: a.provider,
              label: a.displayName ?? a.username ?? a.provider,
            }))}
          />
        </Suspense>
      )}

      {children}
    </div>
    </ToastProvider>
  );
}
