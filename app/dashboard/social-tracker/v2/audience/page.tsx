// Audience — "who is watching?"

import { prisma } from "@/lib/prisma";
import { computeBestTimes } from "@/lib/social/metrics";
import { loadAudience } from "@/lib/social/queries";
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
      // The newest-row-per-key dedup lives in loadAudience — the same helper
      // /api/social/audience uses, so the page and the API cannot disagree
      // about what the latest capture contains.
      const audience = await loadAudience(account.id, audienceSince);
      const rows: AudienceRowView[] = audience.rows;

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
      return { account, rows, bestTimes, capturedAt: audience.capturedAt };
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
