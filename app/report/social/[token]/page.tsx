import { prisma } from "@/lib/prisma";
import { computeAnalytics, postEngagementRate } from "@/lib/social/analytics";
import { recordLinkView, verifyReportLink, type LinkRejection } from "@/lib/social/report-link";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/social/types";
import { fmtCompact, fmtPct } from "@/app/components/charts/format";

// Public, read-only performance report reached via a signed link
// (POST /api/social/report-link). Server-rendered; shows aggregate stats only —
// no tokens, no account internals, no mutation surface.
//
// The token is verified against a database row now, not just its own signature,
// so a revoked link stops working immediately (see lib/social/report-link.ts).
// Its own fmt/fmtPct helpers are gone in favour of the shared formatters, so a
// number here reads exactly as it does on the dashboard it came from.

export const dynamic = "force-dynamic";

const RANGE_DAYS = 30;

const REJECTION_COPY: Record<LinkRejection, { title: string; detail: string }> = {
  expired: {
    title: "This report link has expired",
    detail: "Ask the sender for a fresh link — report links expire so they cannot be shared forever.",
  },
  revoked: {
    // Deliberately stated plainly. Someone revoked this on purpose, and
    // pretending it merely expired would invite a support ticket about a
    // decision that was intentional.
    title: "This report link has been turned off",
    detail: "The person who shared it revoked access. Ask them for a new link if you still need it.",
  },
  invalid: {
    title: "This report link is not valid",
    detail: "Check that you copied the whole link, or ask the sender for a new one.",
  },
};

export default async function SocialReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verification = await verifyReportLink(token);

  if (!verification.ok) {
    const copy = REJECTION_COPY[verification.reason];
    return (
      <Shell>
        <div className="py-20 text-center">
          <h1 className="mb-2 text-lg font-bold text-gray-900">{copy.title}</h1>
          <p className="text-sm text-gray-500">{copy.detail}</p>
        </div>
      </Shell>
    );
  }

  const { link } = verification;
  // Scoped to the ids on the ROW, and re-checked against the owner: a link
  // whose account was disconnected (or reassigned) must not keep resolving.
  const account = await prisma.socialAccount.findFirst({
    where: { id: { in: link.accountIds }, userId: link.userId },
    select: {
      id: true, provider: true, username: true, displayName: true, avatarUrl: true, lastSyncedAt: true,
    },
  });

  if (!account) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <h1 className="mb-2 text-lg font-bold text-gray-900">This report is no longer available</h1>
          <p className="text-sm text-gray-500">The account it covered has been disconnected.</p>
        </div>
      </Shell>
    );
  }

  await recordLinkView(link.id);

  const [snapshots, posts] = await Promise.all([
    prisma.socialAccountSnapshot.findMany({
      where: { accountId: account.id },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
    }),
    prisma.socialPost.findMany({
      where: { accountId: account.id },
      select: {
        id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true, publishedAt: true,
        views: true, likes: true, comments: true, shares: true, saves: true, reach: true, watchTimeSec: true,
      },
    }),
  ]);

  const a = computeAnalytics(snapshots, posts, RANGE_DAYS, new Date());
  const platform = PROVIDER_LABELS[account.provider as ProviderId] ?? account.provider;
  const showContent = link.sections.length === 0 || link.sections.includes("content");

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-4">
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-gray-100" />
        )}
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {account.displayName || account.username || platform}
          </h1>
          <p className="text-sm text-gray-500">
            {platform} · {RANGE_DAYS}-day performance report
            {account.lastSyncedAt ? ` · data as of ${account.lastSyncedAt.toLocaleDateString("en-GB")}` : ""}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 sm:grid-cols-4">
        <Tile label="Followers" value={fmtCompact(a.followers.current)} delta={a.followers.deltaPct} />
        <Tile label="Engagement rate" value={fmtPct(a.engagementRate.current)} delta={a.engagementRate.deltaPct} />
        <Tile label={`Views gained (${RANGE_DAYS}d)`} value={fmtCompact(a.views.current)} delta={a.views.deltaPct} />
        <Tile label={`Posts (${RANGE_DAYS}d)`} value={`${a.postsInRange}`} />
      </div>

      {showContent && a.topPosts.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Top posts</p>
          <div className="space-y-3">
            {a.topPosts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-gray-400">{i + 1}</span>
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" className="h-8 w-12 flex-shrink-0 rounded bg-gray-100 object-cover" />
                ) : (
                  <div className="h-8 w-12 flex-shrink-0 rounded bg-gray-100" />
                )}
                <span className="flex-1 truncate text-sm text-gray-700">{p.caption || "Untitled"}</span>
                <span className="text-sm font-semibold text-gray-700">{fmtCompact(p.views ?? p.reach)}</span>
                <span className="w-16 text-right text-xs text-gray-500">
                  {fmtPct(postEngagementRate(p))} ER
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-gray-500">
        Generated with{" "}
        <a href="https://clipiro.com" className="font-semibold text-blue-600">
          Clipiro
        </a>{" "}
        Social Tracker
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function Tile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  const flat = delta == null || Math.abs(delta) < 0.05;
  return (
    <div className="bg-white px-4 py-3.5">
      {/* text-gray-500, not 400: the old shade was 2.85:1 on white, a WCAG
          failure on a label that carries the meaning of the number below it. */}
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {delta !== undefined && (
          <span
            className={`text-[11px] font-semibold ${
              flat ? "text-gray-500" : delta! > 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {flat ? "→" : delta! > 0 ? "↑" : "↓"} {delta == null ? "" : `${Math.abs(delta).toFixed(1)}%`}
          </span>
        )}
      </div>
    </div>
  );
}
