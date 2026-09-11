// Content — "what worked?", and now "what should I make next?"

import { capabilityMap } from "@/lib/social/capabilities";
import { prisma } from "@/lib/prisma";
import { getToolConfig } from "@/lib/tool-config";
import type { ContentRecommendations } from "@/lib/social/ai/schemas";
import { ContentTable } from "../components/ContentTable";
import { ContentAiPanel } from "../components/ContentAiPanel";
import { EmptyAccounts } from "../components/EmptyAccounts";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { accounts, filters } = await loadViewContext(await searchParams);
  if (accounts.length === 0) return <EmptyAccounts />;

  // Prices are read on the server so each button can state its cost BEFORE the
  // click, and the stored recommendation set is loaded so the panel opens with
  // last week's answer rather than an empty card and a spend button.
  const [recommendationsCost, captionCost, narrateCost] = await Promise.all([
    getToolConfig("social-content-recs").then((c) => c.creditCost),
    getToolConfig("social-caption").then((c) => c.creditCost),
    getToolConfig("social-post-narration").then((c) => c.creditCost),
  ]);

  const stored = await prisma.aiInsight.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) }, kind: "content_recommendations" },
    orderBy: { createdAt: "desc" },
  });
  const latestFor = (accountId: string) => stored.find((s) => s.accountId === accountId) ?? null;

  return (
    <div className="space-y-8">
      {accounts.map((account) => {
        const insight = latestFor(account.id);
        return (
          <section key={account.id} aria-labelledby={`content-${account.id}`} className="space-y-4">
            {accounts.length > 1 && (
              <h2 id={`content-${account.id}`} className="text-sm font-semibold text-fg">
                {accountLabel(account)}
              </h2>
            )}

            <ContentAiPanel
              accountId={account.id}
              accountLabel={accountLabel(account)}
              tz={account.timezone ?? "UTC"}
              range={filters.range}
              recommendationsCost={recommendationsCost}
              captionCost={captionCost}
              initialRecommendations={(insight?.content ?? null) as ContentRecommendations | null}
              generatedAt={insight?.createdAt.toISOString() ?? null}
            />

            <ContentTable
              accountId={account.id}
              capabilities={capabilityMap(account.provider, account.observed)}
              narrateCost={narrateCost}
            />
          </section>
        );
      })}
    </div>
  );
}
