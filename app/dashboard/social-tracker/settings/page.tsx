// Settings — connections and sync health.

import { availableProviders } from "@/lib/social/providers";
import { AccountSettingsList } from "../components/AccountSettingsList";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Load every account regardless of the account filter — you cannot manage a
  // connection you have filtered out of view.
  const { accounts } = await loadViewContext({ ...(await searchParams), accounts: undefined });

  return (
    <AccountSettingsList
      providers={availableProviders()}
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
