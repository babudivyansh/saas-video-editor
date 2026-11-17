// Posts — everything you've published, and everything you've planned.
//
//   Published  → every tracked post with its numbers (all time, sortable)
//   Needs you  → Instagram/Facebook posts that are due, failed and missed ones
//   Scheduled  → what's going out, and when
//   Calendar   → the same plan as a month

import Link from "next/link";
import { capabilityMap } from "@/lib/social/capabilities";
import { listPosts } from "@/lib/mobile/posts";
import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { EmptyAccounts } from "../components/EmptyAccounts";
import { PublishedTable } from "../components/PublishedTable";
import { PlannedPosts, type PlannedPost } from "../components/PlannedPosts";
import { PostCalendar } from "../components/PostCalendar";
import { Button } from "@/app/components/ui/Button";
import { accountLabel, first, loadViewContext, type SearchParams } from "../shared";

export const dynamic = "force-dynamic";

const VIEWS = ["published", "needs-you", "scheduled", "calendar"] as const;
type View = (typeof VIEWS)[number];

export default async function PostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { userId, accounts, filters } = await loadViewContext(params);
  if (accounts.length === 0) return <EmptyAccounts />;

  const raw = first(params.view);
  const view: View = (VIEWS as readonly string[]).includes(raw ?? "") ? (raw as View) : "published";

  // The plan: 30 days back to 90 ahead (the service's window), for the
  // accounts in view.
  const inView = new Set(accounts.map((a) => a.id));
  const { posts } = await listPosts(userId, { limit: 200 });
  const scoped = filters.scope.kind === "one" ? posts.filter((p) => inView.has(p.account.id)) : posts;

  const needsYou = scoped.filter((p) => p.status === "your_turn" || p.status === "failed" || p.status === "missed");
  const scheduled = scoped.filter((p) => p.status === "scheduled" || p.status === "posting");

  // "Your turn" posts need the video handed over; nothing else does, so only
  // those rows pay for a signed URL.
  const turnIds = needsYou.filter((p) => p.status === "your_turn").map((p) => p.id);
  const videoRows = turnIds.length
    ? await prisma.clipPublish.findMany({
        where: { id: { in: turnIds }, userId },
        select: { id: true, clip: { select: { videoUrl: true } }, asset: { select: { s3Key: true } } },
      })
    : [];
  const videoUrl = new Map(
    await Promise.all(
      videoRows.map(async (r) => {
        const url = r.clip?.videoUrl
          ? await resignMediaUrl(r.clip.videoUrl)
          : r.asset?.s3Key
            ? await getAssetReadUrl(r.asset.s3Key).catch(() => null)
            : null;
        return [r.id, url] as const;
      }),
    ),
  );
  const withVideo = (list: typeof scoped): PlannedPost[] => list.map((p) => ({ ...p, videoUrl: videoUrl.get(p.id) ?? null }));

  const carry = new URLSearchParams();
  const account = first(params.account);
  if (account) carry.set("account", account);
  const href = (v: View) => {
    const q = new URLSearchParams(carry);
    if (v !== "published") q.set("view", v);
    const s = q.toString();
    return `/dashboard/social-tracker/posts${s ? `?${s}` : ""}`;
  };

  const chips: Array<{ view: View; label: string; count?: number; tone?: string }> = [
    { view: "published", label: "Published" },
    { view: "needs-you", label: "Needs you", count: needsYou.length, tone: "text-warning" },
    { view: "scheduled", label: "Scheduled", count: scheduled.length },
    { view: "calendar", label: "Calendar" },
  ];

  return (
    <div className="space-y-5">
      <nav aria-label="Posts views" className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <Link
            key={c.view}
            href={href(c.view)}
            prefetch={false}
            aria-current={view === c.view ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === c.view ? "bg-brand text-on-primary" : "border border-line bg-panel text-fg-muted hover:text-fg"
            }`}
          >
            {c.label}
            {c.count !== undefined && c.count > 0 && (
              <span className={view === c.view ? "" : (c.tone ?? "text-fg-subtle")}>{c.count}</span>
            )}
          </Link>
        ))}
      </nav>

      {view === "published" &&
        accounts.map((a) => (
          <section key={a.id} aria-labelledby={`published-${a.id}`} className="space-y-3">
            {accounts.length > 1 && (
              <h2 id={`published-${a.id}`} className="text-sm font-semibold text-fg">
                {accountLabel(a)}
              </h2>
            )}
            <PublishedTable accountId={a.id} capabilities={capabilityMap(a.provider, a.observed)} />
          </section>
        ))}

      {view === "needs-you" && (
        <Card>
          <PlannedPosts
            posts={withVideo(needsYou)}
            empty={<Empty text="Nothing needs you right now." />}
          />
        </Card>
      )}

      {view === "scheduled" && (
        <Card>
          <PlannedPosts posts={withVideo(scheduled)} empty={<Empty text="Nothing scheduled." />} />
        </Card>
      )}

      {view === "calendar" && <PostCalendar posts={withVideo(scoped)} />}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-card)] border border-line bg-panel p-4 sm:p-5">{children}</div>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-fg-muted">{text}</p>
      <div className="mt-3">
        <Button size="sm" href="/dashboard/social-tracker/new" prefetch={false}>
          + New post
        </Button>
      </div>
    </div>
  );
}
