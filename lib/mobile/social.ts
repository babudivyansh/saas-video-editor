import type {
  AnalyticsOverview,
  Audience,
  Competitor,
  ContentPerformance,
  InsightsOverview,
  Kpi,
  PlatformAnalytics,
  Provider,
  ReportFile,
  SavedReport,
  ShareLink,
  SocialAccount,
  WeeklySummary,
} from "@clipiro/shared";
import { BLOCK_LABELS, PROVIDER_LABEL, PROVIDERS, RANGE_DAYS, REPORT_FORMATS, REPORT_SCHEDULES, REPORT_SECTIONS } from "@clipiro/shared";
import { prisma } from "@/lib/prisma";
import { computeEngagementStats } from "@/lib/social/competitors";
import { aggregateKpis } from "@/lib/social/aggregate-kpis";
import { comparePlatforms, computeBestTimes, rangeBounds, type MetricDelta } from "@/lib/social/metrics";
import { loadAccountKpis, loadAccounts, loadAudience, loadSeries, type AccountContext, type AccountKpis } from "@/lib/social/queries";
import { timezoneSchema } from "@/lib/social/schemas";

// The Insights and Social Studio answers for /api/mobile/v1/social, built on
// the Social Tracker's own services (lib/social/queries, metrics,
// aggregate-kpis): the same accounts, KPIs, series and audience the web shows,
// in the app's shapes. Every query is scoped to the caller's accounts.

const DAY = 86_400_000;
const AUDIENCE_WINDOW_DAYS = 45; // as the web: providers refresh demographics weekly at best

const isProvider = (p: string): p is Provider => (PROVIDERS as readonly string[]).includes(p);
const kpi = (d: MetricDelta | undefined): Kpi => ({ value: d?.current ?? null, delta: d?.deltaPct ?? null });
const round1 = (n: number) => Math.round(n * 10) / 10;

export function accountHealth(a: Pick<AccountContext, "status" | "lastSyncedAt">): SocialAccount["health"] {
  if (a.status !== "active") return "reconnect";
  return a.lastSyncedAt ? "healthy" : "syncing";
}

function toAccount(a: AccountContext): SocialAccount | null {
  if (!isProvider(a.provider)) return null; // TikTok and other retired providers aren't in the app
  return {
    id: a.id,
    provider: a.provider,
    name: a.displayName ?? a.username ?? a.provider,
    handle: a.username ? `@${a.username.replace(/^@/, "")}` : "",
    avatarUrl: a.avatarUrl,
    followers: Math.max(0, a.followers ?? 0),
    health: accountHealth(a),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
  };
}

async function appAccounts(userId: string, accountIds?: string[]) {
  return (await loadAccounts(userId, accountIds)).filter((a) => isProvider(a.provider));
}

export async function listAccounts(userId: string): Promise<SocialAccount[]> {
  return (await appAccounts(userId)).flatMap((a) => toAccount(a) ?? []);
}

/** Owned account by id, or null. */
export async function ownedAccount(userId: string, accountId: string): Promise<AccountContext | null> {
  return (await appAccounts(userId, [accountId]))[0] ?? null;
}

async function kpisFor(accounts: AccountContext[], range: number, tz: string) {
  const { from, to } = rangeBounds(range, new Date());
  const per = await Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? tz)));
  return { per, from, to };
}

/** Values per date, summed across accounts (dates ascending). */
async function summedSeries(accounts: AccountContext[], metric: "views" | "followers", from: Date, to: Date, tz: string) {
  const all = await Promise.all(accounts.map((a) => loadSeries(a, metric, from, to, "day", a.timezone ?? tz)));
  const byDate = new Map<string, number>();
  for (const s of all) for (const p of s.points) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function platformShares(per: AccountKpis[]) {
  const rows = comparePlatforms(
    per.map((p) => ({
      accountId: p.account.id,
      provider: p.account.provider,
      label: p.account.displayName ?? p.account.username ?? p.account.provider,
      followers: p.account.followers,
      engagementRate: p.kpis.engagementRate.current,
    })),
  );
  const byProvider = new Map<Provider, number>();
  for (const r of rows) if (isProvider(r.provider)) byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + (r.followerShare ?? 0));
  return [...byProvider.entries()].map(([provider, share]) => ({ provider, share: Math.round(share) })).sort((a, b) => b.share - a.share);
}

const postTitle = (caption: string | null | undefined) => (caption ?? "").split("\n")[0]!.trim().slice(0, 80) || "Untitled post";

export async function buildOverview(userId: string, range: number, tz: string): Promise<InsightsOverview> {
  const accounts = await appAccounts(userId);
  const empty = { value: null, delta: null };
  if (!accounts.length) {
    return { range, sample: false, totals: { views: empty, followers: empty, engagementRate: empty, clipsPosted: empty }, series: [], byPlatform: [], topClip: null };
  }
  const { per, from, to } = await kpisFor(accounts, range, tz);
  const totals = aggregateKpis(per);
  const [series, top] = await Promise.all([
    summedSeries(accounts, "views", from, to, tz),
    prisma.socialPost.findFirst({
      where: { accountId: { in: accounts.map((a) => a.id) }, publishedAt: { gte: from, lte: to } },
      orderBy: { views: { sort: "desc", nulls: "last" } },
      select: { caption: true, views: true, thumbnailUrl: true, account: { select: { provider: true } } },
    }),
  ]);
  return {
    range,
    sample: accounts.some((a) => !a.lastSyncedAt),
    totals: { views: kpi(totals.views), followers: kpi(totals.followers), engagementRate: kpi(totals.engagementRate), clipsPosted: kpi(totals.postsPublished) },
    series,
    byPlatform: platformShares(per),
    topClip:
      top && isProvider(top.account.provider)
        ? { title: postTitle(top.caption), views: top.views ?? 0, provider: top.account.provider, thumbnailUrl: top.thumbnailUrl ?? "" }
        : null,
  };
}

const FORMAT: Record<string, string> = { VIDEO: "Video", REELS: "Reel", REEL: "Reel", SHORT: "Short", SHORTS: "Short", IMAGE: "Photo", CAROUSEL_ALBUM: "Carousel", CAROUSEL: "Carousel", STORY: "Story" };

export async function buildContent(userId: string, range: number, tz: string, accountId: string | null): Promise<ContentPerformance> {
  const accounts = await appAccounts(userId, accountId ? [accountId] : undefined);
  if (!accounts.length) return { avgViews: null, avgWatchPercent: null, bestTime: null, posts: [] };
  const { from, to } = rangeBounds(range, new Date());
  const posts = await prisma.socialPost.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) }, publishedAt: { gte: from, lte: to } },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: {
      id: true, caption: true, thumbnailUrl: true, mediaType: true, publishedAt: true, views: true, reach: true,
      likes: true, comments: true, shares: true, saves: true, account: { select: { provider: true } },
    },
  });
  const { per } = await kpisFor(accounts, range, tz);
  const best = computeBestTimes(posts, accounts[0]!.timezone ?? tz).best;
  const withViews = posts.filter((p) => p.views != null);
  return {
    avgViews: withViews.length ? Math.round(withViews.reduce((s, p) => s + (p.views ?? 0), 0) / withViews.length) : null,
    avgWatchPercent: aggregateKpis(per).avgViewPercentage?.current ?? null,
    // Too few posts to call a best time with any confidence.
    bestTime: best && posts.length >= 5 ? BLOCK_LABELS[best.block]! : null,
    posts: posts.flatMap((p) =>
      isProvider(p.account.provider)
        ? [{
            id: p.id,
            title: postTitle(p.caption),
            provider: p.account.provider,
            format: FORMAT[(p.mediaType ?? "").toUpperCase()] ?? "Post",
            thumbnailUrl: p.thumbnailUrl ?? "",
            views: p.views ?? 0,
            likes: p.likes ?? 0,
            comments: p.comments ?? 0,
            shares: p.shares ?? 0,
          }]
        : [],
    ),
  };
}

type Rows = Awaited<ReturnType<typeof loadAudience>>["rows"];

/** One dimension's buckets as percentages, largest first. Counts are converted, never shown as %. */
function buckets(rows: Rows, dimension: string, top = 6) {
  const pick = rows.filter((r) => r.dimension === dimension && (r.audience === "followers" || !r.audience));
  const list = pick.length ? pick : rows.filter((r) => r.dimension === dimension);
  const total = list.reduce((s, r) => s + r.value, 0);
  const pct = (r: Rows[number]) => (r.unit === "count" ? (total > 0 ? (r.value / total) * 100 : 0) : r.value);
  return list
    .map((r) => ({ label: r.bucket, percent: round1(Math.max(0, Math.min(100, pct(r)))) }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, top);
}

export async function buildPlatform(account: AccountContext, range: number, tz: string): Promise<PlatformAnalytics> {
  const { per, from, to } = await kpisFor([account], range, tz);
  const k = per[0]!.kpis;
  const [growth, audience] = await Promise.all([
    summedSeries([account], "followers", from, to, tz),
    loadAudience(account.id, new Date(Date.now() - AUDIENCE_WINDOW_DAYS * DAY)),
  ]);
  const watch = k.watchTimeSec;
  return {
    provider: account.provider as Provider,
    followers: kpi(k.followers),
    views: kpi(k.views),
    engagementRate: kpi(k.engagementRate),
    watchTimeHours: { value: watch.current == null ? null : round1(watch.current / 3600), delta: watch.deltaPct },
    growth,
    age: buckets(audience.rows, "age"),
    countries: buckets(audience.rows, "country", 5),
  };
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // the app's grid starts on Monday; JS days start on Sunday
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * When followers are online, 7 days (Mon first) × 6 four-hour blocks, 0–100.
 * Providers report active days and active hours separately, so the grid is
 * their product (an estimate). Without them, it falls back to when this
 * account's own posts got the most engagement.
 */
async function onlineGrid(account: AccountContext, rows: Rows, tz: string): Promise<number[][]> {
  const days = rows.filter((r) => r.dimension === "activeDay");
  const hours = rows.filter((r) => r.dimension === "activeHour");
  const grid = Array.from({ length: 7 }, () => Array<number>(6).fill(0));
  if (days.length && hours.length) {
    const dayVal = (d: number) => days.find((r) => r.bucket.toLowerCase() === DAY_NAMES[d] || r.bucket === String(d))?.value ?? 0;
    const blockVal = (b: number) => hours.filter((r) => Math.floor(Number(r.bucket) / 4) === b).reduce((s, r) => s + r.value, 0);
    DAY_ORDER.forEach((d, i) => {
      for (let b = 0; b < 6; b++) grid[i]![b] = dayVal(d) * blockVal(b);
    });
  } else {
    const posts = await prisma.socialPost.findMany({
      where: { accountId: account.id, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 200,
      select: { id: true, publishedAt: true, views: true, reach: true, likes: true, comments: true, shares: true, saves: true },
    });
    for (const c of computeBestTimes(posts, account.timezone ?? tz).cells) grid[DAY_ORDER.indexOf(c.day)]![c.block] = c.avgEngagementRate;
  }
  const max = Math.max(0, ...grid.flat());
  return grid.map((row) => row.map((v) => (max > 0 ? Math.round((v / max) * 100) : 0)));
}

export async function buildAudience(account: AccountContext, tz: string): Promise<Audience> {
  const [audience, gained] = await Promise.all([
    loadAudience(account.id, new Date(Date.now() - AUDIENCE_WINDOW_DAYS * DAY)),
    kpisFor([account], 30, tz),
  ]);
  const gender = buckets(audience.rows, "gender", 10);
  const share = (re: RegExp) => gender.filter((g) => re.test(g.label)).reduce((s, g) => s + g.percent, 0);
  const women = share(/^(f|female|women)$/i);
  const men = share(/^(m|male|men)$/i);
  return {
    provider: account.provider as Provider,
    followers: Math.max(0, account.followers ?? 0),
    followersGainedThisMonth: Math.round(gained.per[0]!.kpis.followersGained.current ?? 0),
    gender: { women: round1(women), men: round1(men), other: round1(gender.length ? Math.max(0, 100 - women - men) : 0) },
    age: buckets(audience.rows, "age"),
    online: await onlineGrid(account, audience.rows, tz),
    countries: buckets(audience.rows, "country", 5),
    cities: buckets(audience.rows, "city", 5),
  };
}

export async function buildAnalyticsOverview(userId: string, range: number, tz: string): Promise<AnalyticsOverview> {
  const accounts = await appAccounts(userId);
  const none = { value: null, delta: null };
  if (!accounts.length) {
    return { totalFollowers: { ...none, gained: 0 }, followerSeries: [], views: none, engagementRate: none, interactions: none, topShare: { provider: "youtube", percent: 0 }, healthScore: null };
  }
  const { per, from, to } = await kpisFor(accounts, range, tz);
  const t = aggregateKpis(per);
  const shares = platformShares(per);
  const scored = accounts.filter((a) => a.healthScore != null);
  return {
    totalFollowers: { ...kpi(t.followers), gained: Math.round(t.followersGained?.current ?? 0) },
    followerSeries: await summedSeries(accounts, "followers", from, to, tz),
    views: kpi(t.views),
    engagementRate: kpi(t.engagementRate),
    interactions: kpi(t.totalInteractions),
    topShare: shares[0] ? { provider: shares[0].provider, percent: shares[0].share } : { provider: accounts[0]!.provider as Provider, percent: 0 },
    healthScore: scored.length ? Math.round(scored.reduce((s, a) => s + a.healthScore!, 0) / scored.length) : null,
  };
}

export async function listCompetitors(userId: string): Promise<Competitor[]> {
  const rows = await prisma.competitorProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, provider: true, handle: true, displayName: true, avatarUrl: true, followers: true, lastSyncedAt: true, createdAt: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 60, select: { capturedAt: true, followers: true, engagementRate: true, postsPerWeek: true } },
    },
  });
  return rows.flatMap((c) => {
    if (!isProvider(c.provider)) return [];
    const latest = c.snapshots[0];
    // Follower change over the last 30 days (or since tracking began).
    const monthAgo = Date.now() - 30 * DAY;
    const base = c.snapshots.find((s) => s.capturedAt.getTime() <= monthAgo) ?? c.snapshots[c.snapshots.length - 1];
    const now = c.followers ?? latest?.followers ?? 0;
    return [{
      id: c.id,
      provider: c.provider,
      name: c.displayName ?? c.handle,
      handle: `@${c.handle.replace(/^@/, "")}`,
      avatarUrl: c.avatarUrl,
      followers: Math.max(0, now),
      engagementRate: Math.max(0, latest?.engagementRate ?? 0),
      postsPerWeek: Math.max(0, latest?.postsPerWeek ?? 0),
      followerChange: base?.followers != null ? now - base.followers : 0,
      lastSyncedAt: (c.lastSyncedAt ?? c.createdAt).toISOString(),
    }];
  });
}

/** The latest AI summary for an account, in the app's shape. */
export function toSummary(row: { id: string; accountId: string; kind: string; content: unknown; periodStart: Date; periodEnd: Date; createdAt: Date }): WeeklySummary | null {
  const period = row.kind.replace("executive_summary_", "");
  if (period !== "weekly" && period !== "monthly") return null;
  const c = row.content as { summary?: string; wins?: string[]; concerns?: string[]; recommendations?: { title: string; rationale: string }[] };
  return {
    id: row.id,
    accountId: row.accountId,
    period,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    createdAt: row.createdAt.toISOString(),
    summary: c.summary ?? "",
    wins: c.wins ?? [],
    concerns: c.concerns ?? [],
    recommendations: (c.recommendations ?? []).map((r) => ({ title: r.title, why: r.rationale })),
  };
}

/** ?range= (one of the app's ranges, default 30) and ?tz= (an IANA zone, default UTC), validated as the web does. */
export function rangeAndTz(req: { nextUrl: URL }): { ok: true; range: number; tz: string } | { ok: false; error: string } {
  const q = req.nextUrl.searchParams;
  const range = Number(q.get("range") ?? 30);
  if (!(RANGE_DAYS as readonly number[]).includes(range)) return { ok: false, error: `range must be one of ${RANGE_DAYS.join(", ")}` };
  const tz = timezoneSchema.safeParse(q.get("tz") ?? "UTC");
  if (!tz.success) return { ok: false, error: "tz must be a time zone like Asia/Kolkata" };
  return { ok: true, range, tz: tz.data };
}

// ── Competitors: your own row ─────────────────────────────────────────────

/**
 * Your Instagram and YouTube accounts measured the way competitors are
 * (lib/social/competitors.ts computeEngagementStats: (avg likes + avg
 * comments) / followers, and posts a week) over the last 30 days, so the
 * "You vs. competitors" table compares like with like.
 */
export async function myCompetitorStats(userId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId, provider: { in: ["instagram", "youtube"] }, status: { not: "revoked" } },
    select: { id: true, provider: true, followers: true },
  });
  const since = new Date(Date.now() - 30 * DAY);
  return Promise.all(
    accounts.flatMap((a) => {
      if (!isProvider(a.provider)) return [];
      const provider = a.provider;
      return [
        (async () => {
          const posts = await prisma.socialPost.findMany({ where: { accountId: a.id, publishedAt: { gte: since } }, select: { likes: true, comments: true, publishedAt: true } });
          const s = computeEngagementStats(
            posts.map((p) => ({ likes: p.likes, comments: p.comments, publishedAt: p.publishedAt?.toISOString() ?? null })),
            a.followers,
          );
          return { accountId: a.id, provider, engagementRate: s.engagementRate != null ? round1(s.engagementRate) : null, postsPerWeek: s.postsPerWeek != null ? round1(s.postsPerWeek) : null };
        })(),
      ];
    }),
  );
}

// ── Reports and share links ───────────────────────────────────────────────

const SECTION_LABEL: Record<string, string> = Object.fromEntries(REPORT_SECTIONS.map((s) => [s.id, s.label]));
const shortDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fileStatus = (s: string): ReportFile["status"] => (s === "done" ? "ready" : s === "failed" ? "failed" : "running");

/** A run as a file: its setup's name and the dates it covers. */
export function toReportFile(run: { id: string; format: string; status: string; sizeBytes: number | null; createdAt: Date; periodStart: Date; periodEnd: Date }, name: string | null): ReportFile {
  return {
    id: run.id,
    title: `${name ?? "Report"} · ${shortDay(run.periodStart)} – ${shortDay(run.periodEnd)}`,
    format: (REPORT_FORMATS as readonly string[]).includes(run.format) ? (run.format as ReportFile["format"]) : "pdf",
    status: fileStatus(run.status),
    sizeBytes: run.sizeBytes,
    createdAt: run.createdAt.toISOString(),
  };
}

/** What a share link shows, as its name (the web stores no name): "YouTube, Instagram · KPIs, Trends". */
export function shareLinkName(accountIds: string[], sections: string[], providerOf: Map<string, string>): string {
  const providers = [...new Set(accountIds.map((id) => providerOf.get(id)).filter((p): p is Provider => !!p && isProvider(p)))].map((p) => PROVIDER_LABEL[p]);
  return `${providers.join(", ") || "Accounts"} · ${sections.map((s) => SECTION_LABEL[s] ?? s).join(", ")}`;
}

/** Saved setups, recent files (newest first) and active share links. */
export async function listReports(userId: string): Promise<{ saved: SavedReport[]; files: ReportFile[]; links: ShareLink[] }> {
  const [configs, runs, links, accounts] = await Promise.all([
    prisma.socialReportConfig.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.socialReportRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, configId: true, format: true, status: true, sizeBytes: true, createdAt: true, periodStart: true, periodEnd: true } }),
    prisma.socialReportLink.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, accountIds: true, sections: true, viewCount: true, expiresAt: true } }),
    prisma.socialAccount.findMany({ where: { userId }, select: { id: true, provider: true } }),
  ]);
  const providerOf = new Map(accounts.map((a) => [a.id, a.provider]));
  const nameOf = new Map(configs.map((c) => [c.id, c.name]));
  const sections = new Set<string>(REPORT_SECTIONS.map((s) => s.id));
  return {
    saved: configs.map((c) => ({
      id: c.id,
      name: c.name,
      accountIds: c.accountIds,
      sections: c.sections.filter((s): s is SavedReport["sections"][number] => sections.has(s)),
      format: (REPORT_FORMATS as readonly string[]).includes(c.format) ? (c.format as SavedReport["format"]) : "pdf",
      schedule: (REPORT_SCHEDULES as readonly string[]).includes(c.schedule) ? (c.schedule as SavedReport["schedule"]) : "none",
    })),
    files: runs.map((r) => toReportFile(r, r.configId ? (nameOf.get(r.configId) ?? null) : null)),
    links: links.map((l) => ({ id: l.id, name: shareLinkName(l.accountIds, l.sections, providerOf), views: l.viewCount, expiresAt: l.expiresAt.toISOString() })),
  };
}
