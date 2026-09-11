"use client";

// Post-level analytics table.
//
// Sorting and filtering push to the URL so a view is shareable, and paging uses
// the keyset cursor from lib/social/pagination — the v1 table's id-only cursor
// skipped or repeated rows whenever the sort column tied, which it does
// constantly for shares and saves.

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fmtCompact, fmtDateLong, fmtDuration, fmtPct } from "@/app/components/charts/format";
import { Button } from "@/app/components/ui/Button";
import { Panel } from "@/app/components/dashboard";
import type { MetricKey, Support } from "@/lib/social/capabilities";
import { SocialApiError, useSocialApi } from "./useSocialApi";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

export interface ContentPost {
  id: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
  watchTimeSec: number | null;
  avgViewPercentage: number | null;
  viralScore: number | null;
  engagementRate: number | null;
  /** One-line "why this did what it did", written by /api/social/narrate. */
  aiScoreReason: string | null;
}

const SORTS = [
  { value: "publishedAt", label: "Newest" },
  { value: "views", label: "Views" },
  { value: "reach", label: "Reach" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "viralScore", label: "Viral score" },
] as const;

/** Columns hidden when the provider cannot supply them. */
const COLUMN_METRIC: Record<string, MetricKey> = {
  Reach: "reach",
  Impressions: "impressions",
  Saves: "saves",
  Shares: "shares",
  "Watch time": "watchTimeSec",
  Completion: "avgViewPercentage",
};

export function ContentTable({
  accountId,
  capabilities,
  narrateCost,
}: {
  accountId: string;
  capabilities: Record<MetricKey, Support>;
  /** Price of one narration batch. Omitted hides the action entirely. */
  narrateCost?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sort = params.get("sort") ?? "publishedAt";
  // The global range filter applies here too. It did not before: the table
  // fetched every post regardless, so "30 days" sat above a list running back
  // years. Only dateFrom is sent — clamping the top end would hide a post whose
  // publishedAt is slightly ahead of our clock, which providers do report.
  const dateFrom = isoDaysAgo(Number(params.get("range") ?? 30));

  /** Bumped by Retry to re-trigger the load effect. */
  const [retryToken, setRetryToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // One state object stamped with the query it belongs to. `loading` is then
  // DERIVED — state.key !== key — rather than being a flag the effect has to set
  // synchronously on entry, which is what react-hooks/set-state-in-effect
  // objects to. It also makes a stale response structurally impossible to
  // display: the result carries the key it was fetched for.
  // dateFrom is part of the key, so changing the range refetches rather than
  // leaving the previous window's rows on screen under the new label.
  const key = `${accountId}|${sort}|${dateFrom}|${retryToken}`;
  const [state, setState] = useState<{
    key: string;
    posts: ContentPost[] | null;
    cursor: string | null;
    error: string | null;
  }>({ key: "", posts: null, cursor: null, error: null });

  const loading = state.key !== key;
  const { posts, cursor, error } = state;

  const api = useSocialApi();

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const qs = new URLSearchParams({ accountId, sort, dateFrom, limit: "25" });
      if (nextCursor) qs.set("cursor", nextCursor);
      return api<{ posts: ContentPost[]; nextCursor: string | null }>(`/api/social/content?${qs}`);
    },
    [api, accountId, sort, dateFrom],
  );

  // The first page loads inside the effect with a cancellation flag. Beyond
  // satisfying react-hooks/set-state-in-effect, this fixes a real race: changing
  // the sort twice quickly could let the slower first response land after the
  // faster second one and show the wrong ordering.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchPage();
        if (!cancelled) setState({ key, posts: data.posts, cursor: data.nextCursor, error: null });
      } catch {
        // An explicit failure state, not the empty state — v1 rendered "no
        // posts" on a failed fetch, telling users their content had vanished.
        if (!cancelled) {
          setState({ key, posts: null, cursor: null, error: "Couldn't load posts." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPage, key]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      setState((prev) => ({
        ...prev,
        posts: [...(prev.posts ?? []), ...data.posts],
        cursor: data.nextCursor,
      }));
    } catch {
      setState((prev) => ({ ...prev, error: "Couldn't load more posts." }));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage]);

  const [showAllColumns, setShowAllColumns] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [confirmingNarrate, setConfirmingNarrate] = useState(false);
  const [narrateError, setNarrateError] = useState<string | null>(null);

  const setSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", value);
    router.push(`${pathname}?${next}`, { scroll: false });
  };

  const visible = (label: string) => {
    const metric = COLUMN_METRIC[label];
    return !metric || capabilities[metric] !== "unavailable";
  };

  const supported = ALL_COLUMNS.filter(visible);

  /**
   * Columns the capability matrix allows but which are empty for every row.
   *
   * The matrix answers "can this platform ever report it"; it cannot answer
   * "did we get it". A YouTube channel synced without the analytics scope, or
   * before the nightly scoring job has run, passes the first test and fails the
   * second — which is how the live table ended up ten columns wide with five of
   * them entirely em-dashes.
   */
  const empty = posts
    ? supported.filter((c) => posts.length > 0 && posts.every((p) => cellRaw(c, p) === null))
    : [];

  const columns = showAllColumns ? supported : supported.filter((c) => !empty.includes(c));

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
        <span className="sr-only">Loading posts…</span>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-8 text-center shadow-sm">
        <p className="text-sm text-fg-muted">{error}</p>
        <div className="mt-4">
          {/* Re-runs the effect by clearing the error, rather than duplicating
              the fetch logic in a second code path. */}
          <Button size="sm" onClick={() => setRetryToken((n) => n + 1)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // The top ten unexplained posts on screen. One batch, one model call, one
  // charge — the route caps at ten, so the button offers exactly that.
  const unexplained = (posts ?? []).filter((p) => !p.aiScoreReason).slice(0, 10);

  async function explainTopPosts() {
    setNarrating(true);
    setNarrateError(null);
    try {
      const data = await api<{ narrations: Array<{ postId: string; verdict: string; narration: string }> }>(
        "/api/social/narrate",
        { method: "POST", body: JSON.stringify({ accountId, postIds: unexplained.map((p) => p.id) }) },
      );
      const byId = new Map(data.narrations.map((n) => [n.postId, `${n.verdict}: ${n.narration}`]));
      setState((prev) => ({
        ...prev,
        posts: (prev.posts ?? []).map((p) =>
          byId.has(p.id) ? { ...p, aiScoreReason: byId.get(p.id)! } : p,
        ),
      }));
    } catch (e) {
      setNarrateError(
        e instanceof SocialApiError && e.status === 402
          ? "You're out of credits. Top up and try again."
          : "Couldn't explain these posts. You have not been charged.",
      );
    } finally {
      setNarrating(false);
      setConfirmingNarrate(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-line bg-panel px-2 py-1 text-xs text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        {empty.length > 0 && (
          // The hidden columns are named, not just dropped: a user who expects
          // watch time needs to know it is missing rather than assume the table
          // never had it.
          <button
            type="button"
            onClick={() => setShowAllColumns((v) => !v)}
            className="ml-auto text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {showAllColumns
              ? `Hide ${empty.length} empty ${empty.length === 1 ? "column" : "columns"}`
              : `Show ${empty.length} empty ${empty.length === 1 ? "column" : "columns"} (${empty.join(", ").toLowerCase()})`}
          </button>
        )}

        {narrateCost !== undefined && unexplained.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className={empty.length > 0 ? "" : "ml-auto"}
            disabled={narrating}
            onClick={() => setConfirmingNarrate(true)}
          >
            {narrating
              ? "Explaining…"
              : `Explain ${unexplained.length} ${unexplained.length === 1 ? "post" : "posts"} · ${narrateCost} credit${narrateCost === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {posts && posts.length === 0 ? (
        <Panel title="No posts tracked yet" dashed dashedNote="nothing synced yet">
          <p className="py-2 text-xs text-fg-subtle">
            Publish something, or widen the date range — the first sync only pulls recent history.
          </p>
        </Panel>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-sm">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Published posts with their performance metrics, sorted by{" "}
                {SORTS.find((s) => s.value === sort)?.label ?? sort}.
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-fg-muted">Post</th>
                  {columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-fg-muted whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts?.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-bg">
                    <th scope="row" className="max-w-xs px-4 py-2.5 text-left font-normal">
                      <PostCell post={p} />
                      {/* The end of a chain that was dead in all three links:
                          nothing called /api/social/narrate, so aiScoreReason
                          was never written, and this table — which the route's
                          own comment says reads it — never rendered it. */}
                      {p.aiScoreReason && (
                        <span className="mt-1 block text-[11px] leading-relaxed text-fg-muted">
                          {p.aiScoreReason}
                        </span>
                      )}
                    </th>
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-right tabular-nums text-fg whitespace-nowrap">
                        {cellValue(c, p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cursor && (
            <div className="text-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {narrateError && (
        <p role="alert" className="text-xs text-warning">
          {narrateError}
        </p>
      )}

      <ConfirmDialog
        open={confirmingNarrate}
        title={`Explain ${unexplained.length} ${unexplained.length === 1 ? "post" : "posts"}?`}
        message={`This spends ${narrateCost} credit${narrateCost === 1 ? "" : "s"} and writes a one-line reason onto each of them.`}
        confirmLabel={`Spend ${narrateCost} credit${narrateCost === 1 ? "" : "s"}`}
        onConfirm={explainTopPosts}
        onClose={() => setConfirmingNarrate(false)}
      />
    </div>
  );
}

/**
 * `yyyy-mm-dd`, n days back, in the viewer's own timezone.
 *
 * Local rather than UTC on purpose: the range reads as "the last 30 days" to the
 * person looking at it, and toISOString() would shift the boundary by a day for
 * anyone far enough east or west.
 */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (Number.isFinite(days) && days > 0 ? days : 30));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function PostCell({ post }: { post: ContentPost }) {
  const label = post.caption?.trim() || "Untitled post";
  // fmtDateLong, not fmtDateShort: the short form drops the year because a chart
  // axis implies it, but this table lists posts up to a year apart. "13 Aug" on a
  // post from last year reads as a date in the future.
  const date = post.publishedAt ? fmtDateLong(post.publishedAt.slice(0, 10)) : "—";

  const body = (
    <span className="flex items-center gap-2">
      {post.thumbnailUrl && (
        // Plain img, not next/image: the IG/FB/YT CDN hosts are not in
        // next.config remotePatterns, and adding them also changes the CSP
        // img-src. Tracked as a follow-up.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumbnailUrl} alt="" className="h-8 w-12 flex-shrink-0 rounded object-cover" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-fg">{label}</span>
        <span className="block text-xs text-fg-muted">
          {date}
          {post.mediaType ? ` · ${post.mediaType}` : ""}
        </span>
      </span>
    </span>
  );

  // A post with no permalink gets a span, not <a href="#"> — v1 rendered
  // focusable links that went nowhere.
  return post.permalink ? (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {body}
    </a>
  ) : (
    body
  );
}

const ALL_COLUMNS = [
  "Views", "Reach", "Impressions", "Engagement", "Likes", "Comments",
  "Shares", "Saves", "Watch time", "Completion", "Viral",
];

/** The underlying number, so "is this column entirely empty?" can be asked. */
function cellRaw(column: string, p: ContentPost): number | null {
  switch (column) {
    case "Views": return p.views;
    case "Reach": return p.reach;
    case "Impressions": return p.impressions;
    case "Engagement": return p.engagementRate;
    case "Likes": return p.likes;
    case "Comments": return p.comments;
    case "Shares": return p.shares;
    case "Saves": return p.saves;
    case "Watch time": return p.watchTimeSec;
    case "Completion": return p.avgViewPercentage;
    case "Viral": return p.viralScore;
    default: return null;
  }
}

function cellValue(column: string, p: ContentPost): string {
  switch (column) {
    case "Views": return fmtCompact(p.views);
    case "Reach": return fmtCompact(p.reach);
    case "Impressions": return fmtCompact(p.impressions);
    case "Engagement": return fmtPct(p.engagementRate);
    case "Likes": return fmtCompact(p.likes);
    case "Comments": return fmtCompact(p.comments);
    case "Shares": return fmtCompact(p.shares);
    case "Saves": return fmtCompact(p.saves);
    case "Watch time": return fmtDuration(p.watchTimeSec);
    case "Completion": return fmtPct(p.avgViewPercentage);
    // A viral score below its cohort minimum is null, and must read as "not
    // enough comparable posts" rather than as a zero.
    case "Viral": return p.viralScore == null ? "—" : p.viralScore.toFixed(0);
    default: return "—";
  }
}
