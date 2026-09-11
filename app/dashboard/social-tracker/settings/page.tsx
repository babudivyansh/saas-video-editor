// Settings — connections, sync health, and goals.

import { providerAvailability } from "@/lib/social/providers";
import { capabilityMap } from "@/lib/social/capabilities";
import { METRIC_LABELS } from "@/lib/social/ai/factsheets";
import { MAX_GOALS } from "@/lib/social/goals";
import { prisma } from "@/lib/prisma";
import { AccountSettingsList } from "../components/AccountSettingsList";
import { GoalManager } from "../components/GoalManager";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Load every account regardless of the current scope — you cannot manage,
  // re-sync or disconnect a connection that the account switcher has filtered
  // out of view. Both scope keys are cleared, not just the legacy one.
  const { userId, allAccounts: accounts } = await loadViewContext({
    ...(await searchParams),
    accounts: undefined,
    account: undefined,
  });

  const goals = await prisma.socialGoal.findMany({
    where: { userId, status: { in: ["active", "hit", "missed"] } },
    orderBy: { dueAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <AccountSettingsList
        providers={providerAvailability()}
        accounts={accounts.map((a) => ({
          id: a.id,
          provider: a.provider,
          label: accountLabel(a),
          followers: a.followers,
          status: a.status,
          lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
          timezone: a.timezone,
        }))}
      />

      {/* This is where GoalsStrip's "Manage" link has always pointed. Until now
          it landed on connection settings and there was no goal UI anywhere. */}
      {accounts.length > 0 && (
        <GoalManager
          maxGoals={MAX_GOALS}
          metricLabels={METRIC_LABELS}
          accounts={accounts.map((a) => ({
            id: a.id,
            label: accountLabel(a),
            capabilities: capabilityMap(a.provider, a.observed),
          }))}
          initialGoals={goals.map((g) => ({
            id: g.id,
            accountId: g.accountId,
            metric: g.metric,
            target: g.target,
            dueAt: g.dueAt.toISOString(),
            status: g.status,
          }))}
        />
      )}
    </div>
  );
}
