import {
  contentPerformanceSchema,
  insightsOverviewSchema,
  platformAnalyticsSchema,
  socialAccountSchema,
  type ContentPerformance,
  type InsightsOverview,
  type PlatformAnalytics,
  type Provider,
  type RangeDays,
  type SocialAccount,
} from "@clipiro/shared";
import { z } from "zod";
import { respond } from "./core";

// Stand-in for /api/mobile/v1/social (the web's Social Tracker) until Phase 5.
// Scenarios (core.ts): "social" — "empty" = no accounts connected.

const ACCOUNTS: SocialAccount[] = [
  { id: "acc_yt", provider: "youtube", name: "Maya Okafor", handle: "@mayaokafor", avatarUrl: "asset:creator-golden", followers: 12_400, health: "healthy", lastSyncedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { id: "acc_fb", provider: "facebook", name: "Maya Creates", handle: "mayacreates", avatarUrl: "asset:founder-portrait", followers: 8_100, health: "healthy", lastSyncedAt: new Date(Date.now() - 5 * 3600_000).toISOString() },
  { id: "acc_ig", provider: "instagram", name: "maya.okafor", handle: "@maya.okafor", avatarUrl: "asset:creator-violet", followers: 5_600, health: "reconnect", lastSyncedAt: new Date(Date.now() - 4 * 86_400_000).toISOString() },
];

export async function getSocialAccounts(): Promise<SocialAccount[]> {
  const s = await respond("social");
  return z.array(socialAccountSchema).parse(s === "empty" ? [] : ACCOUNTS);
}

/** A smooth upward series with a little noise, `points` long. */
function series(points: number, start: number, end: number, seed: number) {
  const out = [];
  const day = 86_400_000;
  for (let i = 0; i < points; i++) {
    const t = i / Math.max(1, points - 1);
    const wobble = Math.sin(i * 1.7 + seed) * 0.05 + Math.sin(i * 0.6 + seed * 2) * 0.03;
    out.push({ date: new Date(Date.now() - (points - 1 - i) * day).toISOString().slice(0, 10), value: Math.round(start + (end - start) * t * (1 + wobble)) });
  }
  return out;
}

const scale = (range: RangeDays) => range / 30;

export async function getInsightsOverview(range: RangeDays): Promise<InsightsOverview> {
  await respond("insights");
  const k = scale(range);
  return insightsOverviewSchema.parse({
    range,
    sample: false,
    totals: {
      views: { value: Math.round(412_000 * k), delta: 18 },
      followers: { value: 26_100, delta: 4.8 },
      engagementRate: { value: 6.8, delta: 0.4 },
      clipsPosted: { value: Math.max(1, Math.round(24 * k)), delta: null },
    },
    series: series(Math.min(range, 30), 4_000, 22_000, 1),
    byPlatform: [
      { provider: "youtube", share: 48 },
      { provider: "instagram", share: 34 },
      { provider: "facebook", share: 18 },
    ],
    topClip: { title: "Nobody tells you this part", views: 128_000, provider: "youtube", thumbnailUrl: "asset:creator-smile" },
  });
}

export async function getContentPerformance(range: RangeDays): Promise<ContentPerformance> {
  await respond("insights");
  const k = Math.min(1, scale(range));
  const p = (id: string, title: string, provider: Provider, format: string, photo: string, views: number, likes: number, comments: number, shares: number) => ({
    id,
    title,
    provider,
    format,
    thumbnailUrl: `asset:${photo}`,
    views: Math.round(views * k),
    likes: Math.round(likes * k),
    comments: Math.round(comments * k),
    shares: Math.round(shares * k),
  });
  return contentPerformanceSchema.parse({
    avgViews: Math.round(17_200 * k),
    avgWatchPercent: 71,
    bestTime: "6 PM",
    posts: [
      p("po1", "Nobody tells you this part", "youtube", "Shorts", "creator-smile", 128_000, 9_400, 312, 1_100),
      p("po2", "We almost shut down twice", "instagram", "Reels", "founder-portrait", 84_000, 6_100, 204, 620),
      p("po3", "The exact cold-email script", "youtube", "Shorts", "creator-violet", 61_000, 3_800, 96, 410),
      p("po4", "One more rep", "facebook", "Video", "gym-lift", 42_000, 2_900, 58, 2_400),
      p("po5", "Why we ignored investors", "youtube", "Shorts", "creator-golden", 23_000, 1_200, 41, 88),
    ],
  });
}

const PLATFORM: Record<Provider, Omit<PlatformAnalytics, "provider" | "growth">> = {
  youtube: {
    followers: { value: 12_400, delta: 5.4 },
    views: { value: 198_000, delta: 22 },
    engagementRate: { value: 7.2, delta: 0.6 },
    watchTimeHours: { value: 1_800, delta: 12 },
    age: [
      { label: "13–17", percent: 8 },
      { label: "18–24", percent: 38 },
      { label: "25–34", percent: 32 },
      { label: "35–44", percent: 14 },
      { label: "45+", percent: 8 },
    ],
    countries: [
      { label: "India", percent: 41 },
      { label: "United States", percent: 22 },
      { label: "United Kingdom", percent: 9 },
      { label: "Canada", percent: 6 },
    ],
  },
  instagram: {
    followers: { value: 5_600, delta: 3.3 },
    views: { value: 140_000, delta: 9 },
    engagementRate: { value: 6.8, delta: -0.3 },
    watchTimeHours: { value: 620, delta: 4 },
    age: [
      { label: "13–17", percent: 6 },
      { label: "18–24", percent: 41 },
      { label: "25–34", percent: 33 },
      { label: "35–44", percent: 13 },
      { label: "45+", percent: 7 },
    ],
    countries: [
      { label: "India", percent: 44 },
      { label: "United States", percent: 19 },
      { label: "United Kingdom", percent: 8 },
      { label: "UAE", percent: 5 },
    ],
  },
  facebook: {
    followers: { value: 8_100, delta: 1.1 },
    views: { value: 74_000, delta: -4 },
    engagementRate: { value: 4.1, delta: 0.2 },
    watchTimeHours: { value: 310, delta: -2 },
    age: [
      { label: "13–17", percent: 2 },
      { label: "18–24", percent: 18 },
      { label: "25–34", percent: 36 },
      { label: "35–44", percent: 26 },
      { label: "45+", percent: 18 },
    ],
    countries: [
      { label: "India", percent: 52 },
      { label: "United States", percent: 14 },
      { label: "Nigeria", percent: 7 },
      { label: "United Kingdom", percent: 6 },
    ],
  },
};

export async function getPlatformAnalytics(provider: Provider, range: RangeDays): Promise<PlatformAnalytics> {
  await respond("insights");
  const p = PLATFORM[provider];
  const f = p.followers.value ?? 0;
  return platformAnalyticsSchema.parse({ provider, ...p, growth: series(Math.min(range, 30), Math.round(f * 0.94), f, provider.length) });
}

/** The web's /api/social/export (CSV). Phase 7 saves the real file. */
export async function exportContentCsv(): Promise<{ filename: string; rows: number }> {
  await respond("export");
  return { filename: "clipiro-content-30d.csv", rows: 5 };
}
