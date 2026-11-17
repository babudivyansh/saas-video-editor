// The posts that did best in the period, or the latest ones when nothing was
// published in it. Never an empty "nothing synced" card for a channel that
// simply hasn't posted this month.

import Link from "next/link";
import { fmtCompact, fmtDateLong, fmtPct } from "@/app/components/charts/format";

export interface TopPost {
  id: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  views: number | null;
  engagementRate: number | null;
  avgViewPercentage: number | null;
}

export function TopPosts({ posts, latest }: { posts: TopPost[]; latest: boolean }) {
  return (
    <section aria-labelledby="top-posts-heading" className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="top-posts-heading" className="text-sm font-semibold text-fg">
          {latest ? "Latest posts" : "Top posts this period"}
        </h2>
        <Link href="/dashboard/social-tracker/posts" prefetch={false} className="text-xs font-semibold text-brand hover:underline">
          All posts →
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-fg-muted">Your posts show up here after the next sync.</p>
      ) : (
        <ol className="divide-y divide-line">
          {posts.map((p) => {
            const body = (
              <>
                {p.thumbnailUrl ? (
                  // Platform CDN hosts aren't in next/image's remotePatterns.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" className="h-10 w-16 flex-shrink-0 rounded-md bg-surface-3 object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-10 w-16 flex-shrink-0 rounded-md bg-surface-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{p.caption?.trim() || "Untitled post"}</span>
                  <span className="block text-xs text-fg-muted">{p.publishedAt ? fmtDateLong(p.publishedAt.slice(0, 10)) : "—"}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-fg">{fmtCompact(p.views)} views</span>
                  <span className="block text-xs text-fg-muted">
                    {p.avgViewPercentage != null
                      ? `${fmtPct(p.avgViewPercentage)} watched`
                      : p.engagementRate != null
                        ? `${fmtPct(p.engagementRate)} engagement`
                        : ""}
                  </span>
                </span>
              </>
            );
            return (
              <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
                {p.permalink ? (
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-90">
                    {body}
                  </a>
                ) : (
                  <span className="flex items-center gap-3">{body}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
