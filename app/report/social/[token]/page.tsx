import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { computeAnalytics, postEngagementRate } from "@/lib/social/analytics";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/social/types";

// Public, read-only performance report reached via a signed 7-day link
// (POST /api/social/report-link). Server-rendered; shows aggregate stats only —
// no tokens, no account internals, no mutation surface.

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

export default async function SocialReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let accountId: string | null = null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { accountId?: string; purpose?: string };
    if (payload.purpose === "social-report" && payload.accountId) accountId = payload.accountId;
  } catch {
    /* invalid/expired — handled below */
  }

  const account = accountId
    ? await prisma.socialAccount.findUnique({
        where: { id: accountId },
        select: { provider: true, username: true, displayName: true, avatarUrl: true, followers: true, lastSyncedAt: true },
      })
    : null;

  if (!account) {
    return (
      <Shell>
        <div className="text-center py-20">
          <h1 className="text-lg font-bold text-gray-900 mb-2">This report link has expired</h1>
          <p className="text-sm text-gray-500">Ask the sender for a fresh link — reports expire after 7 days.</p>
        </div>
      </Shell>
    );
  }

  const [snapshots, posts] = await Promise.all([
    prisma.socialAccountSnapshot.findMany({
      where: { accountId: accountId! },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
    }),
    prisma.socialPost.findMany({
      where: { accountId: accountId! },
      select: {
        id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true, publishedAt: true,
        views: true, likes: true, comments: true, shares: true, saves: true, reach: true, watchTimeSec: true,
      },
    }),
  ]);
  const a = computeAnalytics(snapshots, posts, 30, new Date());
  const platform = PROVIDER_LABELS[account.provider as ProviderId] ?? account.provider;

  return (
    <Shell>
      <div className="flex items-center gap-4 mb-6">
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-100" />
        )}
        <div>
          <h1 className="text-lg font-bold text-gray-900">{account.displayName || account.username || platform}</h1>
          <p className="text-sm text-gray-500">
            {platform} · 30-day performance report{account.lastSyncedAt ? ` · data as of ${account.lastSyncedAt.toLocaleDateString()}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 mb-6">
        <Tile label="Followers" value={fmt(a.followers.current)} delta={a.followers.deltaPct} />
        <Tile label="Engagement rate" value={fmtPct(a.engagementRate.current)} delta={a.engagementRate.deltaPct} />
        <Tile label="Views gained (30d)" value={fmt(a.views.current)} delta={a.views.deltaPct} />
        <Tile label="Posts (30d)" value={`${a.postsInRange}`} />
      </div>

      {a.topPosts.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Top posts</p>
          <div className="space-y-3">
            {a.topPosts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" className="w-12 h-8 rounded object-cover bg-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-8 rounded bg-gray-100 flex-shrink-0" />
                )}
                <span className="flex-1 truncate text-sm text-gray-700">{p.caption || "Untitled"}</span>
                <span className="text-sm font-semibold text-gray-700">{fmt(p.views ?? p.reach)}</span>
                <span className="text-xs text-gray-400 w-16 text-right">{fmtPct(postEngagementRate(p))} ER</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-8">
        Generated with <a href="https://clipiro.com" className="font-semibold text-blue-600">Clipiro</a> Social Tracker
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

function Tile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  const flat = delta == null || Math.abs(delta) < 0.05;
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {delta !== undefined && (
          <span className={`text-[11px] font-semibold ${flat ? "text-gray-400" : delta! > 0 ? "text-emerald-600" : "text-red-600"}`}>
            {flat ? "→" : delta! > 0 ? "↑" : "↓"} {delta == null ? "" : `${Math.abs(delta).toFixed(1)}%`}
          </span>
        )}
      </div>
    </div>
  );
}
