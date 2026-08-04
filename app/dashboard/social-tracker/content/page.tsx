// Content — "what worked?"

import { capabilityMap } from "@/lib/social/capabilities";
import { ContentTable } from "../components/ContentTable";
import { EmptyAccounts } from "../components/EmptyAccounts";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { accounts } = await loadViewContext(await searchParams);
  if (accounts.length === 0) return <EmptyAccounts />;

  return (
    <div className="space-y-8">
      {accounts.map((account) => (
        <section key={account.id} aria-labelledby={`content-${account.id}`}>
          {accounts.length > 1 && (
            <h2 id={`content-${account.id}`} className="mb-3 text-sm font-semibold text-ink">
              {accountLabel(account)}
            </h2>
          )}
          <ContentTable
            accountId={account.id}
            capabilities={capabilityMap(account.provider, account.observed)}
          />
        </section>
      ))}
    </div>
  );
}
