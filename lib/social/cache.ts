// Single owner of every Social Tracker Redis key.
//
// Keys used to be defined in two places (lib/social/service.ts and
// app/api/social/analytics/route.ts) with no shared vocabulary, which is how the
// two invalidation bugs below survived. Everything now goes through here.
//
// VERSION-STAMP PATTERN. Range / granularity / timezone variants make the key
// space open-ended, so instead of enumerating keys to delete we embed a version
// integer in each key and bump it on write. Every stale variant is orphaned at
// once and expires by TTL.
//
// TWO versions matter, and only having the first was a bug:
//   • account version — invalidates one account's analytics
//   • user version    — invalidates cross-account views (/overview, /series),
//                       which must also refresh when any ONE account syncs

import { redis } from "@/lib/redis";

/** Computed payloads are cheap to rebuild; a short TTL bounds staleness. */
export const CACHE_TTL = 300;
/** Version counters outlive any payload so a bump is never lost to expiry. */
const VERSION_TTL = 30 * 86_400;

function versionKey(accountId: string): string {
  return `social:analytics-ver:${accountId}`;
}

function userVersionKey(userId: string): string {
  return `social:user-ver:${userId}`;
}

/** Stable key fragment for an unordered set of ids or metric names. */
function fingerprint(values: readonly string[]): string {
  return [...values].sort().join(",") || "none";
}

export const keys = {
  version: versionKey,
  userVersion: userVersionKey,

  overview: (userId: string, version: string | number) => `social:overview:${userId}:v${version}`,

  analytics: (accountId: string, version: string | number, range: number, tz: string | number) =>
    `social:analytics:${accountId}:v${version}:${range}:${tz}`,

  series: (
    userId: string,
    version: string | number,
    accountIds: readonly string[],
    metrics: readonly string[],
    range: string,
    granularity: string,
    tz: string,
  ) =>
    `social:series:${userId}:v${version}:${fingerprint(accountIds)}:${fingerprint(metrics)}:${range}:${granularity}:${tz}`,

  /** Revoked report links, so revocation takes effect without waiting on the DB. */
  revokedJti: (jti: string) => `social:revoked-jti:${jti}`,
};

export async function accountVersion(accountId: string): Promise<string> {
  return (await redis.get(versionKey(accountId))) ?? "0";
}

export async function userVersion(userId: string): Promise<string> {
  return (await redis.get(userVersionKey(userId))) ?? "0";
}

/**
 * Invalidate everything derived from one account.
 *
 * Bumps the user version too — without it a cross-account overview keeps serving
 * pre-sync numbers after a single account refreshes, which is invisible and
 * wrong. Callers must pass the owning userId for that reason.
 */
export async function invalidateAccount(accountId: string, userId: string): Promise<void> {
  await Promise.all([
    redis.incrWithExpire(versionKey(accountId), VERSION_TTL),
    redis.incrWithExpire(userVersionKey(userId), VERSION_TTL),
  ]);
}

/** Invalidate only the user-scoped views (account list changed, goal edited). */
export async function invalidateUser(userId: string): Promise<void> {
  await redis.incrWithExpire(userVersionKey(userId), VERSION_TTL);
}

/**
 * Read-through cache. A malformed cached value is treated as a miss rather than
 * thrown — a poisoned key must never take the endpoint down.
 */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      /* fall through and recompute */
    }
  }
  const value = await compute();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}
