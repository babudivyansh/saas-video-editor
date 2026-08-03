// Reports — "give me something to send".
//
// CSV export works today via /api/social/export. PDF and Excel are Stage 9; the
// page states that plainly rather than showing dead buttons.

import { Button } from "@/app/components/ui/Button";
import { EmptyAccounts } from "../../components/EmptyAccounts";
import { ShareLinkPanel } from "../../components/ShareLinkPanel";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { kind: "posts", label: "Posts", description: "Every tracked post with its metrics." },
  { kind: "snapshots", label: "Follower history", description: "Daily follower and view counts." },
  { kind: "daily", label: "Daily metrics", description: "Per-day reach, impressions and engagement." },
  { kind: "audience", label: "Audience", description: "Latest demographic breakdown." },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { accounts } = await loadViewContext(await searchParams);
  if (accounts.length === 0) return <EmptyAccounts />;

  return (
    <div className="space-y-8">
      <section aria-labelledby="export-heading">
        <h2 id="export-heading" className="mb-1 text-sm font-semibold text-ink">
          Export data
        </h2>
        <p className="mb-3 text-sm text-ink-soft">
          CSV downloads, ready for a spreadsheet.
        </p>

        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card"
            >
              <p className="mb-3 font-semibold text-ink">{accountLabel(account)}</p>
              <div className="flex flex-wrap gap-2">
                {EXPORTS.map((e) => (
                  <Button
                    key={e.kind}
                    variant="secondary"
                    size="sm"
                    href={`/api/social/export?accountId=${account.id}&kind=${e.kind}`}
                  >
                    {e.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ShareLinkPanel
        accounts={accounts.map((a) => ({ id: a.id, label: accountLabel(a) }))}
      />

      <section
        aria-labelledby="scheduled-heading"
        className="rounded-[var(--radius-card)] border border-dashed border-card-border bg-surface p-6"
      >
        <h2 id="scheduled-heading" className="text-sm font-semibold text-ink">
          PDF and Excel reports
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Scheduled weekly, monthly, quarterly and annual reports — with an AI executive summary —
          are being built. They generate as a background job rather than in the request, because a
          multi-account annual PDF takes long enough to block everything else on the server.
        </p>
      </section>
    </div>
  );
}
