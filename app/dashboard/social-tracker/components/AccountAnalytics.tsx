"use client";

// Per-account analytics panel: computed tiles with period-over-period deltas,
// trend charts, content mix, top posts, and a sortable/paginated posts table
// with CSV export. Fetches /api/social/analytics and /api/social/posts.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import {
  AudienceBars, BestTimeHeatmap, LineChart, StatTile, TypeBars,
  fmtCompact, fmtPct, type BestTimeCell, type SeriesPoint,
} from "@/app/components/charts";

interface MetricDelta {
  current: number | null;
  previous: number | null;
  deltaPct: number | null;
}
interface TopPost {
  id: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  engagementRate: number | null;
}
interface Analytics {
  rangeDays: number;
  followers: MetricDelta;
  engagementRate: MetricDelta;
  views: MetricDelta;
  postsInRange: number;
  postsPerWeek: number | null;
  followerSeries: SeriesPoint[];
  viewsSeries: SeriesPoint[];
  topPosts: TopPost[];
  contentTypes: Array<{ type: string; count: number; avgEngagementRate: number | null }>;
}
interface AccountAlert {
  kind: string;
  severity: "info" | "warning";
  message: string;
}
interface AudienceRow {
  dimension: string;
  bucket: string;
  value: number;
}
interface AnalyticsPayload {
  analytics: Analytics;
  bestTimes: { cells: BestTimeCell[]; best: BestTimeCell | null };
  alerts: AccountAlert[];
  benchmark: { low: number; high: number } | null;
  audience: AudienceRow[];
}
interface TablePost {
  id: string;
  caption?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  reach?: number | null;
}

const SORT_OPTIONS = [
  { value: "publishedAt", label: "Newest" },
  { value: "views", label: "Most viewed" },
  { value: "likes", label: "Most liked" },
  { value: "comments", label: "Most discussed" },
];

export function AccountAnalytics({ accountId, color, isVideo, range }: { accountId: string; color: string; isVideo: boolean; range: number }) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"overview" | "audience" | "insights" | "posts">("overview");
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(false);
    try {
      const tz = -new Date().getTimezoneOffset(); // minutes east of UTC, for the best-time heatmap
      const res = await fetch(`/api/social/analytics?accountId=${accountId}&range=${range}&tz=${tz}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setPayload(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, accountId, range]);

  useEffect(() => {
    load();
  }, [load]);

  const data = payload?.analytics ?? null;
  const hasAudience = (payload?.audience.length ?? 0) > 0;
  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: "overview", label: "Overview" },
    ...(hasAudience ? [{ id: "audience" as const, label: "Audience" }] : []),
    { id: "insights", label: "Insights ✨" },
    { id: "posts", label: "All posts" },
  ];

  return (
    <div className="border-t border-gray-50">
      <div className="flex items-center gap-1 px-5 pt-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer ${
              tab === t.id ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" &&
        (loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <div className="p-5 text-xs text-gray-400 flex items-center gap-3">
            Couldn’t load analytics.
            <button onClick={load} className="font-semibold text-blue-600 cursor-pointer">Retry</button>
          </div>
        ) : data ? (
          <div className="p-5 space-y-4">
            {payload!.alerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {payload!.alerts.map((a) => (
                  <span
                    key={a.message}
                    className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                      a.severity === "warning" ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    }`}
                  >
                    {a.message}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
              <StatTile label="Followers" value={fmtCompact(data.followers.current)} delta={data.followers.deltaPct} />
              <StatTile
                label="Engagement rate"
                value={fmtPct(data.engagementRate.current)}
                delta={data.engagementRate.deltaPct}
                sub={payload!.benchmark ? `typical: ${payload!.benchmark.low}–${payload!.benchmark.high}%` : undefined}
              />
              <StatTile label={`Views gained (${data.rangeDays}d)`} value={fmtCompact(data.views.current)} delta={data.views.deltaPct} />
              <StatTile label="Posts" value={`${data.postsInRange}`} sub={data.postsPerWeek !== null ? `${data.postsPerWeek.toFixed(1)}/week` : undefined} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <LineChart points={data.followerSeries} color={color} title={`Followers — last ${data.rangeDays} days`} />
              <LineChart points={data.viewsSeries} color={color} title={`Total views — last ${data.rangeDays} days`} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TypeBars items={data.contentTypes} />
              <TopPosts posts={data.topPosts} isVideo={isVideo} />
            </div>
            <BestTimeHeatmap cells={payload!.bestTimes.cells} best={payload!.bestTimes.best} />
          </div>
        ) : null)}

      {tab === "audience" && payload && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AudienceBars title="Age" rows={payload.audience.filter((r) => r.dimension === "age")} />
          <AudienceBars title="Gender" rows={payload.audience.filter((r) => r.dimension === "gender")} />
          <AudienceBars title="Top countries" rows={payload.audience.filter((r) => r.dimension === "country")} limit={6} />
        </div>
      )}

      {tab === "insights" && <InsightsPanel accountId={accountId} />}

      {tab === "posts" && <PostsTable accountId={accountId} isVideo={isVideo} />}
    </div>
  );
}

interface Insight {
  content: { summary: string; wins: string[]; recommendations: string[] };
  createdAt: string;
}

function InsightsPanel({ accountId }: { accountId: string }) {
  const { token } = useAuth();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/social/insights?accountId=${accountId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setInsight(d.insight);
          setCost(d.cost);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token, accountId]);

  async function generate() {
    if (!token) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/social/insights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const d = await res.json();
      if (res.ok) setInsight(d.insight);
      else setMessage(d.error || "Generation failed.");
    } catch {
      setMessage("Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const fresh = insight && mountedAt - new Date(insight.createdAt).getTime() < 6 * 86400_000;

  if (loading) return <div className="p-5 text-xs text-gray-400">Loading…</div>;
  return (
    <div className="p-5 space-y-4">
      {insight ? (
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-500">Weekly summary</p>
            <p className="text-[11px] text-gray-400">Generated {new Date(insight.createdAt).toLocaleDateString()}</p>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{insight.content.summary}</p>
          {insight.content.wins.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 mb-1">What worked</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                {insight.content.wins.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {insight.content.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1">Try next week</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                {insight.content.recommendations.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          No insights yet. Generate an AI summary of this account&apos;s last 7 days — every number comes from your real synced data.
        </p>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
      {!fresh && (
        <button
          onClick={generate}
          disabled={generating}
          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl disabled:opacity-50 cursor-pointer"
        >
          {generating ? "Generating…" : `Generate this week's insights${cost ? ` (${cost} credits)` : ""}`}
        </button>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="p-5 space-y-4 animate-pulse" aria-label="Loading analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}

function TopPosts({ posts, isVideo }: { posts: TopPost[]; isVideo: boolean }) {
  if (posts.length === 0)
    return (
      <div className="border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">Top posts</p>
        <p className="text-xs text-gray-400">No posts published in this range.</p>
      </div>
    );
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 mb-3">Top posts (by {isVideo ? "views" : "reach"})</p>
      <div className="space-y-2.5">
        {posts.map((p, i) => (
          <a key={p.id} href={p.permalink || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
            <span className="text-[11px] font-bold text-gray-300 w-4">{i + 1}</span>
            {p.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0 bg-gray-100" />
            ) : (
              <div className="w-10 h-7 rounded bg-gray-100 flex-shrink-0" />
            )}
            <span className="flex-1 truncate text-xs text-gray-700 group-hover:text-blue-600">{p.caption || "Untitled"}</span>
            <span className="text-xs font-semibold text-gray-700">{fmtCompact(p.views ?? p.reach)}</span>
            <span className="text-[11px] text-gray-400 w-14 text-right">{fmtPct(p.engagementRate)} ER</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function PostsTable({ accountId, isVideo }: { accountId: string; isVideo: boolean }) {
  const { token } = useAuth();
  const [posts, setPosts] = useState<TablePost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState("publishedAt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = useCallback(
    async (reset: boolean, cursorArg: string | null, sortArg: string) => {
      if (!token) return;
      setLoading(true);
      setError(false);
      try {
        const p = new URLSearchParams({ accountId, sort: sortArg });
        if (cursorArg && !reset) p.set("cursor", cursorArg);
        const res = await fetch(`/api/social/posts?${p}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const d = await res.json();
        setPosts((prev) => (reset ? d.posts : [...prev, ...d.posts]));
        setCursor(d.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [token, accountId],
  );

  useEffect(() => {
    fetchPage(true, null, sort);
  }, [fetchPage, sort]);

  const exportHref = (kind: string) => `/api/social/export?accountId=${accountId}&kind=${kind}`;

  async function download(kind: string) {
    if (!token) return;
    const res = await fetch(exportHref(kind), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? `${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort posts"
          className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white cursor-pointer"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button onClick={() => download("posts")} className="text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">
            Export posts CSV
          </button>
          <button onClick={() => download("snapshots")} className="text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">
            Export history CSV
          </button>
        </div>
      </div>
      {error ? (
        <div className="text-xs text-gray-400 py-6 text-center">
          Couldn’t load posts. <button onClick={() => fetchPage(true, null, sort)} className="font-semibold text-blue-600 cursor-pointer">Retry</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-semibold pb-2">Post</th>
                <th className="font-semibold pb-2">Type</th>
                <th className="font-semibold pb-2">Published</th>
                <th className="font-semibold pb-2 text-right">{isVideo ? "Views" : "Reach"}</th>
                <th className="font-semibold pb-2 text-right">Likes</th>
                <th className="font-semibold pb-2 text-right">Comments</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-t border-gray-50">
                  <td className="py-2 pr-3 max-w-xs">
                    <a href={post.permalink || "#"} target="_blank" rel="noopener noreferrer" className="block truncate text-gray-700 hover:text-blue-600">
                      {post.caption || "Untitled"}
                    </a>
                  </td>
                  <td className="py-2 text-xs text-gray-400 capitalize">{post.mediaType || "—"}</td>
                  <td className="py-2 text-xs text-gray-400 whitespace-nowrap">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}</td>
                  <td className="py-2 text-right font-medium text-gray-700">{fmtCompact(post.views ?? post.reach)}</td>
                  <td className="py-2 text-right text-gray-500">{fmtCompact(post.likes)}</td>
                  <td className="py-2 text-right text-gray-500">{fmtCompact(post.comments)}</td>
                </tr>
              ))}
              {posts.length === 0 && !loading && (
                <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400">No posts tracked yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {cursor && !error && (
        <button
          onClick={() => fetchPage(false, cursor, sort)}
          disabled={loading}
          className="mt-3 w-full text-xs font-semibold text-gray-500 hover:text-blue-600 py-2 rounded-lg border border-gray-100 disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
