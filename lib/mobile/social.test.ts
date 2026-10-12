import { beforeEach, describe, expect, it, vi } from "vitest";
import { METRIC_KEYS } from "@/lib/social/capabilities";
import { analyticsOverviewSchema, audienceSchema, competitorSchema, contentPerformanceSchema, insightsOverviewSchema, platformAnalyticsSchema } from "@clipiro/shared";

// The Insights builders over stubbed Social Tracker services. Each answer is
// checked against the shared schema the app parses with.

const acct = (over: Record<string, unknown> = {}) => ({
  id: "yt1", provider: "youtube", username: "foundersdaily", displayName: "Founders Daily", avatarUrl: null, followers: 18_000,
  status: "active", lastSyncedAt: new Date("2026-10-06T08:00:00Z"), lastSyncStatus: "ok", lastSyncError: null, timezone: null, healthScore: 82, observed: null, ...over,
});
const d = (current: number | null, deltaPct: number | null = null) => ({ current, previous: null, deltaPct, available: "native", unit: "count", metric: "x" });
const kpis = (over: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, { current: null, previous: null, deltaPct: null, available: "unavailable", unit: "count", metric: k }])),
  followers: d(18_000, 3.2), followersGained: d(560), views: d(240_000, 12.5), engagementRate: d(6.8, 0.4), postsPublished: d(14, -6.7),
  totalInteractions: d(16_300, 9), watchTimeSec: d(7_200_000, 4), avgViewPercentage: d(61, 2), ...over,
});

let accounts: ReturnType<typeof acct>[];
const loadAccountKpis = vi.fn(async (a: ReturnType<typeof acct>) => ({ account: a, kpis: a.provider === "instagram" ? kpis({ followers: d(6_000, 1) }) : kpis(), derived: {}, completeness: 1, capabilities: {} }));
const loadSeries = vi.fn(async (_a: unknown, metric: string) => ({ points: metric === "views" ? [{ date: "2026-10-05", value: 100 }, { date: "2026-10-06", value: 200 }] : [{ date: "2026-10-06", value: 18_000 }] }));
let audienceRows: { dimension: string; bucket: string; value: number; unit: string; audience: string }[];
vi.mock("@/lib/social/queries", () => ({
  loadAccounts: vi.fn(async (_u: string, ids?: string[]) => (ids ? accounts.filter((a) => ids.includes(a.id)) : accounts)),
  loadAccountKpis,
  loadSeries,
  loadAudience: vi.fn(async () => ({ rows: audienceRows, capturedAt: null })),
}));
const postFindMany = vi.fn();
const postFindFirst = vi.fn();
const competitorFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { socialPost: { findMany: postFindMany, findFirst: postFindFirst }, competitorProfile: { findMany: competitorFindMany } } }));

const { accountHealth, buildAnalyticsOverview, buildAudience, buildContent, buildOverview, buildPlatform, listAccounts, listCompetitors, toSummary } = await import("./social");

beforeEach(() => {
  vi.clearAllMocks();
  accounts = [acct(), acct({ id: "ig1", provider: "instagram", username: "maya", displayName: "Maya", followers: 6_000 })];
  audienceRows = [];
  postFindMany.mockResolvedValue([]);
  postFindFirst.mockResolvedValue(null);
});

describe("accounts", () => {
  it("maps health and leaves out providers the app doesn't have", async () => {
    accounts.push(acct({ id: "tt1", provider: "tiktok" }), acct({ id: "fb1", provider: "facebook", status: "expired" }));
    const list = await listAccounts("u1");
    expect(list.map((a) => [a.id, a.handle, a.health])).toEqual([["yt1", "@foundersdaily", "healthy"], ["ig1", "@maya", "healthy"], ["fb1", "@foundersdaily", "reconnect"]]);
    expect(accountHealth({ status: "active", lastSyncedAt: null })).toBe("syncing");
  });
});

describe("overview", () => {
  it("rolls KPIs up with the web's own aggregate, sums daily views, splits followers by platform", async () => {
    postFindFirst.mockResolvedValue({ caption: "Nobody tells you this part\n#founders", views: 48_000, thumbnailUrl: "https://i/t.jpg", account: { provider: "youtube" } });
    const o = insightsOverviewSchema.parse(await buildOverview("u1", 30, "Asia/Kolkata"));
    expect(o.totals.followers).toEqual({ value: 24_000, delta: null }); // no previous period in this data
    expect(o.totals.views.value).toBe(480_000);
    expect(o.totals.clipsPosted.value).toBe(28);
    expect(o.series).toEqual([{ date: "2026-10-05", value: 200 }, { date: "2026-10-06", value: 400 }]);
    expect(o.byPlatform).toEqual([{ provider: "youtube", share: 75 }, { provider: "instagram", share: 25 }]);
    expect(o.topClip).toEqual({ title: "Nobody tells you this part", views: 48_000, provider: "youtube", thumbnailUrl: "https://i/t.jpg" });
  });

  it("is empty, not broken, with no accounts", async () => {
    accounts = [];
    const o = insightsOverviewSchema.parse(await buildOverview("u1", 30, "UTC"));
    expect([o.series, o.byPlatform, o.topClip]).toEqual([[], [], null]);
  });

  it("builds account analytics from the same roll-up", async () => {
    const a = analyticsOverviewSchema.parse(await buildAnalyticsOverview("u1", 30, "UTC"));
    expect(a.totalFollowers).toMatchObject({ value: 24_000, gained: 1120 });
    expect([a.topShare, a.healthScore]).toEqual([{ provider: "youtube", percent: 75 }, 82]);
  });
});

describe("content", () => {
  it("lists posts with friendly formats and only calls a best time with enough posts", async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 5, h));
    postFindMany.mockResolvedValue([
      { id: "p1", caption: "One more rep", thumbnailUrl: null, mediaType: "REELS", publishedAt: at(18), views: 1000, reach: 1000, likes: 90, comments: 4, shares: 2, saves: 1, account: { provider: "instagram" } },
      { id: "p2", caption: null, thumbnailUrl: "t", mediaType: "VIDEO", publishedAt: at(9), views: null, reach: 10, likes: 1, comments: 0, shares: 0, saves: 0, account: { provider: "youtube" } },
    ]);
    const c = contentPerformanceSchema.parse(await buildContent("u1", 30, "UTC", null));
    expect(c.posts.map((p) => [p.title, p.format, p.views])).toEqual([["One more rep", "Reel", 1000], ["Untitled post", "Video", 0]]);
    expect([c.avgViews, c.bestTime]).toEqual([1000, null]);
  });
});

describe("audience and platform", () => {
  it("turns counts into percentages, splits gender, and estimates when followers are online", async () => {
    audienceRows = [
      { dimension: "gender", bucket: "F", value: 58, unit: "percent", audience: "followers" },
      { dimension: "gender", bucket: "M", value: 40, unit: "percent", audience: "followers" },
      { dimension: "country", bucket: "IN", value: 300, unit: "count", audience: "followers" },
      { dimension: "country", bucket: "US", value: 100, unit: "count", audience: "followers" },
      { dimension: "activeDay", bucket: "monday", value: 20, unit: "percent", audience: "followers" },
      { dimension: "activeDay", bucket: "sunday", value: 10, unit: "percent", audience: "followers" },
      { dimension: "activeHour", bucket: "18", value: 9, unit: "percent", audience: "followers" },
      { dimension: "activeHour", bucket: "9", value: 3, unit: "percent", audience: "followers" },
    ];
    const a = audienceSchema.parse(await buildAudience(accounts[0] as never, "UTC"));
    expect(a.gender).toEqual({ women: 58, men: 40, other: 2 });
    expect(a.countries).toEqual([{ label: "IN", percent: 75 }, { label: "US", percent: 25 }]);
    expect(a.online[0]![4]).toBe(100); // Monday, 4–8 PM: the busiest
    expect(a.online[6]![4]).toBe(50); // Sunday, half as busy
    expect(a.followersGainedThisMonth).toBe(560);
  });

  it("gives a platform its KPIs, watch hours and growth", async () => {
    const p = platformAnalyticsSchema.parse(await buildPlatform(accounts[0] as never, 30, "UTC"));
    expect([p.watchTimeHours.value, p.growth]).toEqual([2000, [{ date: "2026-10-06", value: 18_000 }]]);
  });
});

describe("competitors and summaries", () => {
  it("reports the latest engagement and the 30-day follower change", async () => {
    const day = 86_400_000;
    competitorFindMany.mockResolvedValue([
      { id: "c1", provider: "instagram", handle: "growthwithlena", displayName: "Lena", avatarUrl: null, followers: 52_000, lastSyncedAt: new Date(), createdAt: new Date(),
        snapshots: [
          { capturedAt: new Date(), followers: 52_000, engagementRate: 4.2, postsPerWeek: 5 },
          { capturedAt: new Date(Date.now() - 31 * day), followers: 49_500, engagementRate: 4, postsPerWeek: 4 },
        ] },
      { id: "c2", provider: "tiktok", handle: "x", displayName: null, avatarUrl: null, followers: 1, lastSyncedAt: null, createdAt: new Date(), snapshots: [] },
    ]);
    const list = await listCompetitors("u1");
    expect(list).toHaveLength(1);
    expect(competitorSchema.parse(list[0])).toMatchObject({ handle: "@growthwithlena", engagementRate: 4.2, postsPerWeek: 5, followerChange: 2500 });
  });

  it("reads an AI summary row in the app's shape", () => {
    const s = toSummary({
      id: "ai1", accountId: "yt1", kind: "executive_summary_weekly", periodStart: new Date(), periodEnd: new Date(), createdAt: new Date(),
      content: { summary: "Views up 18%.", wins: ["A"], concerns: [], recommendations: [{ title: "Post at 6 PM", rationale: "Your best block." }] },
    });
    expect(s).toMatchObject({ period: "weekly", summary: "Views up 18%.", recommendations: [{ title: "Post at 6 PM", why: "Your best block." }] });
    expect(toSummary({ id: "x", accountId: "a", kind: "content_recs", content: {}, periodStart: new Date(), periodEnd: new Date(), createdAt: new Date() })).toBeNull();
  });
});
