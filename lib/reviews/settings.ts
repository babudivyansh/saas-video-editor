// Runtime-tunable Review-system settings, on the Config-KV pattern
// (lib/tool-config.ts, lib/flags.ts) — one JSON blob under a single Config
// row rather than a dedicated table, since these are simple admin-tunable
// numbers, not queryable/relational data.

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const CONFIG_KEY = "reviews_settings";
const CACHE_KEY = "admin:reviews_settings";
const CACHE_TTL = 60; // seconds

export interface ReviewSettings {
  /** Minimum account age before a review can be submitted. 0 = off. */
  minAccountAgeHours: number;
  /** Require at least one completed render/generation before reviewing. */
  requireProductUsage: boolean;
  /** Spam score (0-100) at/above which a new review is auto-hidden instead of queued pending. */
  spamScoreAutoHideThreshold: number;
  /** Report count at/above which a published review is auto-hidden pending admin review. */
  autoHideReportThreshold: number;
  /** Minimum days between smart review-prompt nudges for the same user. */
  promptThrottleDays: number;
  /** Maximum number of times a user is ever prompted, across their lifetime. */
  promptMaxLifetime: number;
  /** Hours after a prompt is shown before drip Email 1 sends, if still unreviewed. */
  emailDrip1DelayHours: number;
  /** Days after Email 1 sends before Email 2 sends, if still unreviewed. */
  emailDrip2DelayDays: number;
  /** Days after Email 2 sends before Email 3 (final) sends, if still unreviewed. */
  emailDrip3DelayDays: number;
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  minAccountAgeHours: 0,
  requireProductUsage: true,
  spamScoreAutoHideThreshold: 90,
  autoHideReportThreshold: 3,
  promptThrottleDays: 21,
  promptMaxLifetime: 3,
  emailDrip1DelayHours: 24,
  emailDrip2DelayDays: 6,
  emailDrip3DelayDays: 12,
};

async function loadFromDB(): Promise<ReviewSettings> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return { ...REVIEW_SETTINGS_DEFAULTS };
  try {
    const parsed = JSON.parse(row.value) as Partial<ReviewSettings>;
    return { ...REVIEW_SETTINGS_DEFAULTS, ...parsed };
  } catch {
    return { ...REVIEW_SETTINGS_DEFAULTS };
  }
}

export async function getReviewSettings(): Promise<ReviewSettings> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as ReviewSettings;
    } catch {
      // fall through to DB
    }
  }
  const settings = await loadFromDB();
  await redis.set(CACHE_KEY, JSON.stringify(settings), "EX", CACHE_TTL);
  return settings;
}

export async function updateReviewSettings(patch: Partial<ReviewSettings>): Promise<ReviewSettings> {
  const current = await loadFromDB();
  const next = { ...current, ...patch };
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: CONFIG_KEY, value: JSON.stringify(next) },
  });
  await redis.del(CACHE_KEY);
  return next;
}
