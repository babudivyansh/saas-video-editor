// Public-profile data source for competitor tracking. Vendor-agnostic surface
// with a ScrapeCreators implementation (pay-as-you-go, per-request pricing) —
// swap vendors by reimplementing fetchPublicProfile, nothing else changes.
//
// Cost control: every vendor request counts against a monthly Redis budget
// (SOCIAL_COMPETITOR_MONTHLY_BUDGET, default 300). When the budget is spent,
// refreshes pause until the next calendar month rather than running up a bill.

import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { ProviderApiError } from "./errors";

export interface PublicProfile {
  displayName?: string;
  avatarUrl?: string;
  followers: number | null;
}

export type CompetitorProvider = "instagram" | "youtube";
export const COMPETITOR_PROVIDERS: CompetitorProvider[] = ["instagram", "youtube"];

const API = "https://api.scrapecreators.com/v1";

export function isConfigured(): boolean {
  return !!env.SCRAPECREATORS_API_KEY;
}

function monthlyBudget(): number {
  const n = Number(env.SOCIAL_COMPETITOR_MONTHLY_BUDGET ?? 300);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

export class BudgetExhaustedError extends Error {
  constructor() {
    super("competitor-data budget for this month is spent");
  }
}

async function consumeBudget(): Promise<void> {
  const month = new Date().toISOString().slice(0, 7); // yyyy-mm
  const used = await redis.incrWithExpire(`social:competitor-budget:${month}`, 32 * 86400);
  if (used > monthlyBudget()) throw new BudgetExhaustedError();
}

// Vendor payloads differ per platform and drift over time — pluck the follower
// count defensively from the fields ScrapeCreators has used across versions.
// Exported for tests.
export function normalizeProfile(raw: Record<string, unknown>): PublicProfile {
  const o = (raw.data ?? raw.user ?? raw) as Record<string, unknown>;
  const num = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = o[k] ?? (o.stats as Record<string, unknown> | undefined)?.[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
    return null;
  };
  const str = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };
  return {
    displayName: str("full_name", "nickname", "title", "name", "username"),
    avatarUrl: str("profile_pic_url", "avatar_url", "avatarUrl", "thumbnail"),
    followers: num("follower_count", "followers", "followers_count", "followerCount", "subscriberCount", "subscriber_count"),
  };
}

const ENDPOINTS: Record<CompetitorProvider, (handle: string) => string> = {
  instagram: (h) => `${API}/instagram/profile?handle=${encodeURIComponent(h)}`,
  youtube: (h) => `${API}/youtube/channel?handle=${encodeURIComponent(h)}`,
};

export async function fetchPublicProfile(provider: CompetitorProvider, handle: string): Promise<PublicProfile> {
  const key = env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not configured");
  await consumeBudget();
  const res = await fetch(ENDPOINTS[provider](handle.replace(/^@/, "")), { headers: { "x-api-key": key } });
  if (!res.ok) {
    throw new ProviderApiError(`competitor profile fetch failed: ${res.status}`, res.status, await res.text());
  }
  return normalizeProfile((await res.json()) as Record<string, unknown>);
}

export interface PublicPost {
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
}

// Best-effort URL following the same /v1/{provider}/{resource} shape as
// ENDPOINTS above — NOT verified against ScrapeCreators' real API docs
// (no "recent posts" call exists anywhere else in this codebase to copy
// from, and hitting the real vendor here would spend real budget). Confirm
// the actual path/response shape against ScrapeCreators' docs (or a real
// account) before this is relied on in production; fetchRecentPublicPosts
// fails closed (empty array) rather than throwing on a shape mismatch, so a
// wrong guess degrades to "no post-level stats yet" rather than breaking
// the whole competitor refresh.
const POST_ENDPOINTS: Record<CompetitorProvider, (handle: string) => string> = {
  instagram: (h) => `${API}/instagram/posts?handle=${encodeURIComponent(h)}`,
  youtube: (h) => `${API}/youtube/videos?handle=${encodeURIComponent(h)}`,
};

// Vendor payloads vary by field naming, same defensive approach as
// normalizeProfile. Caps at 20 most-recent posts — enough for a meaningful
// average without over-reading a large channel's history.
// Exported for tests, matching normalizeProfile's convention.
export function normalizePosts(raw: unknown): PublicPost[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.data)
      ? ((raw as Record<string, unknown>).data as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.posts)
        ? ((raw as Record<string, unknown>).posts as unknown[])
        : Array.isArray((raw as Record<string, unknown>)?.videos)
          ? ((raw as Record<string, unknown>).videos as unknown[])
          : [];

  const num = (o: Record<string, unknown>, ...keys: string[]): number | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
    return null;
  };
  const str = (o: Record<string, unknown>, ...keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v) return v;
    }
    return null;
  };

  return list.slice(0, 20).map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      likes: num(o, "like_count", "likes", "likeCount"),
      comments: num(o, "comment_count", "comments", "commentCount"),
      publishedAt: str(o, "taken_at", "published_at", "publishedAt", "timestamp"),
    };
  });
}

export async function fetchRecentPublicPosts(provider: CompetitorProvider, handle: string): Promise<PublicPost[]> {
  const key = env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not configured");
  await consumeBudget();
  try {
    const res = await fetch(POST_ENDPOINTS[provider](handle.replace(/^@/, "")), { headers: { "x-api-key": key } });
    if (!res.ok) return [];
    return normalizePosts(await res.json());
  } catch {
    return [];
  }
}
