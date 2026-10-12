import {
  MAX_COMPETITORS,
  analyticsOverviewSchema,
  audienceSchema,
  competitorHandleSchema,
  competitorSchema,
  reportRequest,
  type AnalyticsOverview,
  type Audience,
  type Competitor,
  type Provider,
  type ReportFile,
  type ReportRequest,
  type SavedReport,
  type ShareLink,
  type WeeklySummary,
} from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for the web's /api/social/{overview,audience,competitors,reports,
// report-link,summary} until Phase 5. Scenarios (core.ts): "analytics",
// "summary", "competitors".

const day = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  await respond("analytics");
  const series = Array.from({ length: 30 }, (_, i) => ({ date: ago((29 - i) * day).slice(0, 10), value: Math.round(24_900 + (1_200 * i) / 29 + Math.sin(i * 1.3) * 120) }));
  return analyticsOverviewSchema.parse({
    totalFollowers: { value: 26_100, delta: 4.8, gained: 1_200 },
    followerSeries: series,
    views: { value: 412_000, delta: 18 },
    engagementRate: { value: 6.8, delta: 0.4 },
    interactions: { value: 28_000, delta: 9 },
    topShare: { provider: "youtube", percent: 48 },
    healthScore: 84,
  });
}

/** The latest AI summary per account (GET /social/summary); none until one is made. */
let SUMMARIES: Record<string, WeeklySummary> = {};

export async function getSummary(accountId: string): Promise<WeeklySummary | null> {
  await respond("summary");
  return SUMMARIES[accountId] ?? null;
}

/** Makes the weekly AI summary (5 credits; social-exec-report on the web). */
export async function makeSummary(accountId: string): Promise<WeeklySummary> {
  await respond("summary");
  const s: WeeklySummary = {
    id: `sum_${accountId}`,
    accountId,
    period: "weekly",
    periodStart: ago(7 * day),
    periodEnd: ago(0),
    createdAt: new Date().toISOString(),
    summary: "Views rose 18% on YouTube Shorts, led by “Nobody tells you this part”.",
    wins: ["Three Shorts passed 10K views"],
    concerns: ["Instagram stopped syncing four days ago"],
    recommendations: [{ title: "Post on Monday evenings", why: "Your audience is most active then" }],
  };
  SUMMARIES = { ...SUMMARIES, [accountId]: s };
  return s;
}

const heat = (bias: number) =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => [8, 4, 22, 46, 70, 88].map((v, b) => Math.max(0, Math.min(100, Math.round(v + (d === 0 && b >= 4 ? 12 : 0) - d * 2 + bias + (b === 5 && d >= 4 ? 8 : 0))))));

const AUDIENCE: Record<Provider, Audience> = {
  instagram: {
    provider: "instagram",
    followers: 5_600,
    followersGainedThisMonth: 180,
    gender: { women: 58, men: 40, other: 2 },
    age: [
      { label: "13–17", percent: 6 },
      { label: "18–24", percent: 41 },
      { label: "25–34", percent: 33 },
      { label: "35–44", percent: 13 },
      { label: "45+", percent: 7 },
    ],
    online: heat(0),
    countries: [
      { label: "India", percent: 44 },
      { label: "United States", percent: 19 },
      { label: "United Kingdom", percent: 8 },
      { label: "UAE", percent: 5 },
    ],
    cities: [
      { label: "Mumbai", percent: 14 },
      { label: "Bengaluru", percent: 11 },
      { label: "Delhi", percent: 9 },
    ],
  },
  youtube: {
    provider: "youtube",
    followers: 12_400,
    followersGainedThisMonth: 640,
    gender: { women: 47, men: 52, other: 1 },
    age: [
      { label: "13–17", percent: 8 },
      { label: "18–24", percent: 38 },
      { label: "25–34", percent: 32 },
      { label: "35–44", percent: 14 },
      { label: "45+", percent: 8 },
    ],
    online: heat(-4),
    countries: [
      { label: "India", percent: 41 },
      { label: "United States", percent: 22 },
      { label: "United Kingdom", percent: 9 },
      { label: "Canada", percent: 6 },
    ],
    cities: [
      { label: "Mumbai", percent: 12 },
      { label: "Delhi", percent: 10 },
      { label: "Hyderabad", percent: 7 },
    ],
  },
  facebook: {
    provider: "facebook",
    followers: 8_100,
    followersGainedThisMonth: 90,
    gender: { women: 51, men: 48, other: 1 },
    age: [
      { label: "13–17", percent: 2 },
      { label: "18–24", percent: 18 },
      { label: "25–34", percent: 36 },
      { label: "35–44", percent: 26 },
      { label: "45+", percent: 18 },
    ],
    online: heat(-8),
    countries: [
      { label: "India", percent: 52 },
      { label: "United States", percent: 14 },
      { label: "Nigeria", percent: 7 },
      { label: "United Kingdom", percent: 6 },
    ],
    cities: [
      { label: "Pune", percent: 9 },
      { label: "Chennai", percent: 7 },
      { label: "Lagos", percent: 5 },
    ],
  },
};

export async function getAudience(provider: Provider): Promise<Audience> {
  await respond("analytics");
  return audienceSchema.parse(AUDIENCE[provider]);
}

const INITIAL_COMPETITORS: Competitor[] = [
  { id: "c1", provider: "instagram", name: "Ria Talks", handle: "@riatalks", avatarUrl: "asset:creator-hat", followers: 18_300, engagementRate: 4.1, postsPerWeek: 6, followerChange: 2.1, lastSyncedAt: ago(3 * 3600_000) },
  { id: "c2", provider: "instagram", name: "Build Pod", handle: "@thebuildpod", avatarUrl: "asset:studio-mic", followers: 9_700, engagementRate: 7.4, postsPerWeek: 3.1, followerChange: -0.4, lastSyncedAt: ago(3 * 3600_000) },
];
let COMPETITORS = INITIAL_COMPETITORS;
let seq = 0;

/** Your own accounts on the same yardsticks (GET /social/competitors `mine`). */
const MINE = [
  { accountId: "acc_ig", provider: "instagram" as const, engagementRate: 6.8, postsPerWeek: 4.2 },
  { accountId: "acc_yt", provider: "youtube" as const, engagementRate: 7.2, postsPerWeek: 3.5 },
];

/** GET /social/competitors */
export async function getCompetitors() {
  await respond("competitors");
  return { competitors: z.array(competitorSchema).parse(COMPETITORS), enabled: true, max: MAX_COMPETITORS, mine: MINE };
}

export async function addCompetitor(provider: Provider, rawHandle: string): Promise<Competitor> {
  const parsed = competitorHandleSchema.safeParse(rawHandle);
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Enter a handle", 400, "handle");
  if (COMPETITORS.length >= MAX_COMPETITORS) throw new ApiError(`You can track up to ${MAX_COMPETITORS} competitors.`, 409);
  if (COMPETITORS.some((c) => c.handle.toLowerCase() === `@${parsed.data.toLowerCase()}`)) throw new ApiError("You already track that account.", 409, "handle");
  await wait();
  if (parsed.data.toLowerCase().includes("private")) throw new ApiError("That account is private or doesn't exist.", 404, "handle");
  const c: Competitor = { id: `c_new${++seq}`, provider, name: parsed.data, handle: `@${parsed.data}`, avatarUrl: null, followers: 4_200, engagementRate: 5.2, postsPerWeek: 2.5, followerChange: 0, lastSyncedAt: new Date().toISOString() };
  COMPETITORS = [...COMPETITORS, c];
  return c;
}

export async function removeCompetitor(id: string) {
  await wait();
  COMPETITORS = COMPETITORS.filter((c) => c.id !== id);
}

const INITIAL_SAVED: SavedReport[] = [
  { id: "r1", name: "Monthly performance", accountIds: ["acc_yt", "acc_ig", "acc_fb"], sections: ["kpis", "trends", "ai"], format: "pdf", schedule: "monthly" },
  { id: "r2", name: "Weekly content export", accountIds: ["acc_yt"], sections: ["content", "audience"], format: "xlsx", schedule: "weekly" },
  { id: "r3", name: "Competitor benchmark", accountIds: ["acc_ig"], sections: ["competitors"], format: "csv", schedule: "none" },
];
const INITIAL_FILES: ReportFile[] = [
  { id: "f1", title: "Monthly performance · Sep", format: "pdf", status: "ready", sizeBytes: 1_468_006, createdAt: ago(day) },
  { id: "f2", title: "Weekly content · Sep 22–28", format: "xlsx", status: "ready", sizeBytes: 88_064, createdAt: ago(3 * day) },
  { id: "f3", title: "Competitor benchmark", format: "csv", status: "running", sizeBytes: null, createdAt: ago(60_000) },
];
const INITIAL_LINKS: ShareLink[] = [{ id: "l1", name: "Sponsor view · all accounts", views: 12, expiresAt: new Date(Date.now() + 29 * day).toISOString() }];
let SAVED = INITIAL_SAVED;
let FILES = INITIAL_FILES;
let LINKS = INITIAL_LINKS;

export function resetAnalyticsMocks() {
  SUMMARIES = {};
  COMPETITORS = INITIAL_COMPETITORS;
  SAVED = INITIAL_SAVED;
  FILES = INITIAL_FILES;
  LINKS = INITIAL_LINKS;
}

export async function getReports(): Promise<{ saved: SavedReport[]; files: ReportFile[]; links: ShareLink[] }> {
  await respond("analytics");
  return { saved: SAVED, files: FILES, links: LINKS };
}

/** POST /social/reports → 202 { file }: the setup is saved and its first file starts. */
export async function createReport(input: ReportRequest): Promise<{ file: ReportFile }> {
  const r = reportRequest.parse(input);
  await wait();
  SAVED = [...SAVED, { ...r, id: `r_new${++seq}` }];
  const file: ReportFile = { id: `f_new${seq}`, title: `${r.name} · Sep 10 – Oct 10`, format: r.format, status: "running", sizeBytes: null, createdAt: new Date().toISOString() };
  FILES = [file, ...FILES];
  return { file };
}

/** GET /social/reports/:id/download */
export async function reportDownload(id: string): Promise<{ url: string; filename: string }> {
  await wait();
  const f = FILES.find((x) => x.id === id);
  if (!f) throw new ApiError("Report not found", 404);
  if (f.status !== "ready") throw Object.assign(new ApiError("This report isn't ready yet.", 409), { code: "not_ready" });
  return { url: `https://s3.test/reports/${id}.${f.format}?signed`, filename: `clipiro-report-2026-09-30.${f.format}` };
}

const LABEL: Record<string, string> = { acc_yt: "YouTube", acc_ig: "Instagram", acc_fb: "Facebook" };

/** POST /social/share-links → { link, url }: the URL is only returned now. */
export async function createShareLink(accountIds: string[], days: number): Promise<{ link: ShareLink; url: string }> {
  await wait();
  const link = { id: `l_new${++seq}`, name: `${accountIds.map((a) => LABEL[a] ?? "Account").join(", ")} · KPIs, Trends, Content`, views: 0, expiresAt: new Date(Date.now() + days * day).toISOString() };
  LINKS = [link, ...LINKS];
  return { link, url: `https://clipiro.com/report/social/tok_${link.id}` };
}

export async function revokeShareLink(id: string) {
  await wait();
  LINKS = LINKS.filter((l) => l.id !== id);
}
