// Reports — "give me something to send".
//
// CSV exports of raw data, queued PDF/XLSX/CSV reports, and the share links
// that publish a read-only view of an account.

import { EmptyAccounts } from "../components/EmptyAccounts";
import { ExportButtons } from "../components/ExportButtons";
import { ShareLinkPanel } from "../components/ShareLinkPanel";
import { ReportBuilder } from "../components/ReportBuilder";
import { prisma } from "@/lib/prisma";
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
  const { accounts, userId } = await loadViewContext(await searchParams);
  if (accounts.length === 0) return <EmptyAccounts />;

  const runs = await prisma.socialReportRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, format: true, status: true, error: true, sizeBytes: true, createdAt: true },
  });

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
              <ExportButtons accountId={account.id} exports={EXPORTS} />
            </div>
          ))}
        </div>
      </section>

      <ShareLinkPanel
        accounts={accounts.map((a) => ({ id: a.id, label: accountLabel(a) }))}
      />

      <ReportBuilder
        accounts={accounts.map((a) => ({ id: a.id, label: accountLabel(a) }))}
        initialRuns={runs.map((r) => ({
          id: r.id,
          format: r.format,
          status: r.status,
          error: r.error,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
