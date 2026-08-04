// Competitors — "how do I compare?"

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { compareCompetitors } from "@/lib/social/metrics";
import { fmtCompact, fmtPct } from "@/app/components/charts/format";
import { CompetitorManager } from "../components/CompetitorManager";
import { loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId, accounts } = await loadViewContext(await searchParams);

  // v1 returned null when the vendor was unconfigured, so the whole feature
  // silently vanished with no explanation. Say so instead.
  const vendorConfigured = Boolean(env.SCRAPECREATORS_API_KEY);

  const profiles = await prisma.competitorProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 2 } },
  });

  const rows = compareCompetitors(
    accounts.map((a) => ({ provider: a.provider, followers: a.followers })),
    profiles.map((p) => {
      const [latest, previous] = p.snapshots;
      return {
        id: p.id,
        handle: p.handle,
        provider: p.provider,
        followers: latest?.followers ?? p.followers,
        engagementRate: latest?.engagementRate ?? null,
        postsPerWeek: latest?.postsPerWeek ?? null,
        weekGrowth:
          latest?.followers != null && previous?.followers != null
            ? latest.followers - previous.followers
            : null,
      };
    }),
  );

  return (
    <div className="space-y-6">
      {!vendorConfigured && (
        <p className="rounded-[var(--radius-card)] border border-card-border bg-tint-amber px-4 py-3 text-sm text-ink-soft">
          Competitor tracking needs a public-data provider, which isn&apos;t configured on this
          deployment yet. Existing tracked profiles are shown below but won&apos;t refresh.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-card-border bg-white shadow-card">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Tracked competitor profiles compared against your own accounts on the same platform.
            </caption>
            <thead>
              <tr className="border-b border-card-border">
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-ink-soft">Profile</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-ink-soft">Followers</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-ink-soft">vs you</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-ink-soft">7-day change</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-ink-soft">Engagement</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-ink-soft">Posts / week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-card-border last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                    @{c.handle}
                    <span className="ml-2 text-xs text-ink-soft">{c.provider}</span>
                  </th>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtCompact(c.followers)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c.followerGap === null ? (
                      // No account of ours on that platform — a gap against an
                      // unrelated account would be meaningless.
                      <span className="text-ink-soft">—</span>
                    ) : (
                      <span className={c.followerGap > 0 ? "text-red-600" : "text-emerald-600"}>
                        {c.followerGap > 0 ? "+" : ""}
                        {fmtCompact(c.followerGap)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {c.weekGrowth === null ? "—" : `${c.weekGrowth >= 0 ? "+" : ""}${fmtCompact(c.weekGrowth)}`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtPct(c.engagementRate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {c.postsPerWeek === null ? "—" : c.postsPerWeek.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompetitorManager
        existing={profiles.map((p) => ({ id: p.id, handle: p.handle, provider: p.provider }))}
        enabled={vendorConfigured}
      />
    </div>
  );
}
