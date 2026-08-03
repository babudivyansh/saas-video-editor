// Audience — "who is watching?"

import { prisma } from "@/lib/prisma";
import { computeBestTimes } from "@/lib/social/metrics";
import { BLOCK_LABELS, Heatmap, WEEKDAY_LABELS } from "@/app/components/charts";
import { AudienceBreakdown, type AudienceRowView } from "../../components/AudienceBreakdown";
import { EmptyAccounts } from "../../components/EmptyAccounts";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { accounts } = await loadViewContext(await searchParams);
  if (accounts.length === 0) return <EmptyAccounts />;

  // One `now` for the whole page. Same discipline the metrics engine enforces:
  // every figure describes the same instant, and the render body stays pure.
  const now = new Date();
  const audienceSince = new Date(now.getTime() - 45 * 86_400_000);

  const sections = await Promise.all(
    accounts.map(async (account) => {
      // Keep the newest row per (audience, dimension, bucket) rather than
      // filtering on one exact capturedAt.
      //
      // Rows written during a single sync do NOT share a timestamp — each gets
      // its own default now(), microseconds apart — so an equality filter
      // returns a fragment of the capture. That silently dropped age and gender
      // and left only whichever dimension happened to be written last.
      const recent = await prisma.socialAudienceSnapshot.findMany({
        where: {
          accountId: account.id,
          capturedAt: { gte: audienceSince },
        },
        select: {
          capturedAt: true, dimension: true, bucket: true, value: true, unit: true, audience: true,
        },
        orderBy: { capturedAt: "asc" },
      });

      const newest = new Map<string, (typeof recent)[number]>();
      for (const row of recent) {
        // Ascending input, so a later row for the same key overwrites an
        // earlier one.
        newest.set(`${row.audience}::${row.dimension}::${row.bucket}`, row);
      }

      const rows: AudienceRowView[] = [...newest.values()].map(({ capturedAt: _ignored, ...r }) => r);
      const latest = recent.length > 0 ? recent[recent.length - 1] : null;

      const posts = await prisma.socialPost.findMany({
        where: { accountId: account.id, publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: 200,
        select: {
          id: true, publishedAt: true, views: true, reach: true,
          likes: true, comments: true, shares: true, saves: true,
        },
      });

      const bestTimes = computeBestTimes(posts, account.timezone ?? "UTC");
      return { account, rows, bestTimes, capturedAt: latest?.capturedAt ?? null };
    }),
  );

  return (
    <div className="space-y-10">
      {sections.map(({ account, rows, bestTimes, capturedAt }) => (
        <section key={account.id} aria-labelledby={`audience-${account.id}`} className="space-y-4">
          <div>
            <h2 id={`audience-${account.id}`} className="text-sm font-semibold text-ink">
              {accountLabel(account)}
            </h2>
            {capturedAt && (
              <p className="text-xs text-ink-soft">
                Demographics captured {capturedAt.toISOString().slice(0, 10)}
              </p>
            )}
          </div>

          <Heatmap
            title="Best time to post"
            subtitle={`Based on ${account.timezone ?? "UTC"} local time`}
            cells={bestTimes.cells.map((c) => ({
              row: c.day,
              col: c.block,
              value: c.avgEngagementRate,
              count: c.count,
            }))}
            rowLabels={WEEKDAY_LABELS}
            colLabels={BLOCK_LABELS}
            best={bestTimes.best ? { row: bestTimes.best.day, col: bestTimes.best.block } : null}
          />

          <AudienceBreakdown rows={rows} />
        </section>
      ))}
    </div>
  );
}
