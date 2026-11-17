// Settings: connected accounts, share links and emailed reports.

import { providerAvailability } from "@/lib/social/providers";
import { prisma } from "@/lib/prisma";
import { AccountSettingsList } from "../components/AccountSettingsList";
import { ShareLinkPanel } from "../components/ShareLinkPanel";
import { ReportBuilder } from "../components/ReportBuilder";
import { accountLabel, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Every account regardless of the header's switcher: you can't manage a
  // connection that a filter has hidden.
  const { userId, allAccounts: accounts } = await loadViewContext({
    ...(await searchParams),
    accounts: undefined,
    account: undefined,
  });

  const runs =
    accounts.length > 0
      ? await prisma.socialReportRun.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, format: true, status: true, error: true, sizeBytes: true, createdAt: true },
        })
      : [];
  const options = accounts.map((a) => ({ id: a.id, label: accountLabel(a) }));

  return (
    <div className="mx-auto max-w-4xl space-y-10">
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

      {accounts.length > 0 && (
        <>
          <ShareLinkPanel accounts={options} />
          <ReportBuilder
            accounts={options}
            initialRuns={runs.map((r) => ({
              id: r.id,
              format: r.format,
              status: r.status,
              error: r.error,
              sizeBytes: r.sizeBytes,
              createdAt: r.createdAt.toISOString(),
            }))}
          />
        </>
      )}
    </div>
  );
}
