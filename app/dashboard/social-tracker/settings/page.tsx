// Settings — connections and sync health.

import { providerAvailability } from "@/lib/social/providers";
import { AccountSettingsList } from "../components/AccountSettingsList";
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
  const { allAccounts: accounts } = await loadViewContext({
    ...(await searchParams),
    accounts: undefined,
    account: undefined,
  });

  return (
    <AccountSettingsList
      providers={providerAvailability()}
      accounts={accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        label: accountLabel(a),
        followers: a.followers,
        status: a.status,
        lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      }))}
    />
  );
}
