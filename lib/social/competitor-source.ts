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
