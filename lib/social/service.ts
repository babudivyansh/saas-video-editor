import { Prisma, type SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { createState, makePkce } from "./oauth";
import * as google from "./google";
import * as meta from "./meta";
import { PROVIDERS } from "./providers";
import { classifyError, withRetry } from "./errors";
import { CACHE_TTL, cached, invalidateAccount, invalidateUser, keys, userVersion } from "./cache";
import type { NormalizedAccount, OAuthProvider, OAuthTokens, ProviderId, ProviderSync } from "./types";
import { logger } from "@/lib/logger";
import { shouldSendCategory } from "@/lib/notifications";

// Which OAuth app a requested platform authenticates through.
export function oauthProviderFor(provider: ProviderId): OAuthProvider {
  return PROVIDERS[provider].oauthApp;
}

// ── Connect: build the provider authorize URL ────────────────────────────────
export async function buildAuthUrl(userId: string, provider: ProviderId): Promise<string> {
  const { verifier, challenge } = makePkce();
  const state = await createState(userId, provider, verifier);
  return PROVIDERS[provider].getAuthUrl(state, challenge);
}

// ── Callback: exchange code, persist account(s), run an initial sync ──────────
// Returns the providerIds that were connected (for the success redirect).
export async function handleCallback(
  oauthProvider: OAuthProvider,
  userId: string,
  code: string,
  verifier: string,
): Promise<ProviderId[]> {
  if (oauthProvider === "youtube") {
    const tokens = await google.exchangeCode(code, verifier);
    const sync = await google.sync(tokens.accessToken);
    const account = await upsertAccount(userId, sync.account, tokens);
    await persistSync(account.id, sync);
    await recordAudit(userId, "social.connect", account.id, { provider: "youtube" });
    return ["youtube"];
  }

  // Meta: one grant can yield several accounts (Pages + linked IG). Each stores
  // its own long-lived Page token. The long-lived USER token is kept as the
  // refresh credential (refreshTokenEnc): extending it via fb_exchange_token and
  // re-listing /me/accounts re-derives fresh Page tokens (see meta.refreshTokens).
  const userTokens = await meta.exchangeCode(code, verifier);
  const connected = await meta.fetchAccounts(userTokens.accessToken);
  const providers = new Set<ProviderId>();
  for (const c of connected) {
    const tokens: OAuthTokens = {
      accessToken: c.pageAccessToken,
      refreshToken: userTokens.accessToken,
      expiresAt: userTokens.expiresAt,
      scopes: userTokens.scopes,
    };
    const sync = await meta
      .syncAccount(c.account.providerAccountId, c.account.provider as "facebook" | "instagram", c.pageAccessToken)
      .catch(
        (e) =>
          ({
            account: c.account,
            posts: [],
            partialError: `initial sync failed: ${(e as Error).message}`,
          }) as ProviderSync,
      );
    const account = await upsertAccount(userId, sync.account, tokens);
    await persistSync(account.id, sync);
    await recordAudit(userId, "social.connect", account.id, { provider: c.account.provider });
    providers.add(c.account.provider);
  }
  if (providers.size === 0) throw new Error("no Facebook Pages or Instagram accounts found");
  return [...providers];
}

// ── Token lifecycle ──────────────────────────────────────────────────────────
// Proactive refresh head start per OAuth app. Google access tokens live ~1h and
// refresh in one cheap call — 5 minutes is plenty. Meta long-lived tokens live
// ~60 days and refreshing takes a token exchange plus a /me/accounts round-trip,
// so start a week out to ride through transient Meta failures before expiry.
const REFRESH_WINDOW_MS: Record<OAuthProvider, number> = {
  youtube: 5 * 60_000,
  meta: 7 * 24 * 3600_000,
};

// Returns a usable access token, transparently refreshing (and re-persisting)
// when it is within the provider's refresh window. Marks the account
// needs_reauth on failure.
export async function getValidAccessToken(account: SocialAccount): Promise<string> {
  const windowMs = REFRESH_WINDOW_MS[oauthProviderFor(account.provider as ProviderId)];
  const expiringSoon =
    !!account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < windowMs;
  if (!expiringSoon) return decryptSecret(account.accessTokenEnc);

  if (!account.refreshTokenEnc) {
    await markNeedsReauth(account, "access token expired and no refresh token is stored");
    throw new Error("access token expired and no refresh token is stored");
  }
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  let tokens: OAuthTokens;
  try {
    tokens = await refreshFor(account, refreshToken);
  } catch (e) {
    await markNeedsReauth(account, (e as Error).message);
    throw e;
  }
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEnc: encryptSecret(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {}),
      tokenExpiresAt: tokens.expiresAt ?? null,
      status: "active",
    },
  });
  return tokens.accessToken;
}

function refreshFor(account: SocialAccount, refreshToken: string): Promise<OAuthTokens> {
  // For Meta, refreshToken is the long-lived user token (see handleCallback).
  return PROVIDERS[account.provider as ProviderId].refreshTokens(refreshToken, account.providerAccountId);
}

async function markNeedsReauth(account: SocialAccount, reason: string): Promise<void> {
  await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "needs_reauth" } });
  await recordAudit(account.userId, "social.needs_reauth", account.id, {
    provider: account.provider,
    reason,
  });
}

// ── Re-sync an existing account (manual refresh / scheduled job) ──────────────
const SYNC_LOCK_TTL = 300; // seconds — generously above the slowest backfill

export async function syncAccount(account: SocialAccount): Promise<void> {
  // Manual refresh, page-load auto-refresh, and the scheduled job can all fire
  // for the same account; the fixed-window counter doubles as a lock.
  const lockKey = `social:sync:${account.id}`;
  if ((await redis.incrWithExpire(lockKey, SYNC_LOCK_TTL)) > 1) {
    throw new Error("a sync is already running for this account");
  }
  const startedAt = Date.now();
  try {
    const accessToken = await getValidAccessToken(account);
    // First sync (no posts yet) backfills deeper history so charts open useful.
    const backfill = (await prisma.socialPost.count({ where: { accountId: account.id } })) === 0;
    const sync: ProviderSync = await withRetry(() =>
      PROVIDERS[account.provider as ProviderId].sync(account.providerAccountId, accessToken, { backfill }),
    );

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        displayName: sync.account.displayName ?? account.displayName,
        avatarUrl: sync.account.avatarUrl ?? account.avatarUrl,
        followers: sync.account.metrics.followers ?? account.followers,
        status: "active",
        lastSyncedAt: new Date(),
      },
    });
    await persistSync(account.id, sync);
    await refreshAudienceIfStale(account, accessToken);
    await invalidateAccount(account.id, account.userId);
    await bumpSyncCounter("ok");
    logger.info("social", "sync completed", {
      accountId: account.id,
      provider: account.provider,
      posts: sync.posts.length,
      backfill,
      status: sync.partialError ? "partial" : "ok",
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    await bumpSyncCounter("fail");
    // A dead token discovered mid-sync (not just mid-refresh) also needs reauth.
    if (classifyError(e) === "auth" && account.status !== "needs_reauth") {
      await markNeedsReauth(account, (e as Error).message).catch(() => {});
    }
    // Record why (never overwrites `status` — needs_reauth stays put).
    await prisma.socialAccount
      .update({
        where: { id: account.id },
        data: { lastSyncStatus: "failed", lastSyncError: (e as Error).message },
      })
      .catch(() => {});
    throw e;
  } finally {
    await redis.del(lockKey);
  }
}

// Demographics move slowly and the provider calls are comparatively expensive,
// so refresh at most weekly, riding along on a normal sync. Non-fatal: IG
// returns an error below 100 followers, YT scopes may not cover Analytics —
// either way the sync itself already succeeded.
const AUDIENCE_MAX_AGE_MS = 7 * 86400_000;

async function refreshAudienceIfStale(account: SocialAccount, accessToken: string): Promise<void> {
  const adapter = PROVIDERS[account.provider as ProviderId];
  if (!adapter.fetchAudience) return;
  try {
    const last = await prisma.socialAudienceSnapshot.findFirst({
      where: { accountId: account.id },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });
    if (last && Date.now() - last.capturedAt.getTime() < AUDIENCE_MAX_AGE_MS) return;
    const rows = await adapter.fetchAudience(account.providerAccountId, accessToken);
    if (rows.length === 0) return;
    const capturedAt = new Date();
    await prisma.socialAudienceSnapshot.createMany({
      data: rows.map((r) => ({ accountId: account.id, capturedAt, ...r })),
    });
  } catch (e) {
    logger.warn("social", `audience refresh skipped for ${account.id}`, { reason: (e as Error).message });
  }
}

// Daily sync outcome counters — cheap Redis tallies read by /api/health so an
// external uptime monitor notices a failing sync pipeline without new infra.
async function bumpSyncCounter(kind: "ok" | "fail"): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await redis.incrWithExpire(`social:stats:${day}:${kind}`, 8 * 86400);
}

export async function getSyncStats(): Promise<{ ok: number; fail: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const [ok, fail] = await Promise.all([
    redis.get(`social:stats:${day}:ok`),
    redis.get(`social:stats:${day}:fail`),
  ]);
  return { ok: Number(ok ?? 0), fail: Number(fail ?? 0) };
}

// ── Disconnect: best-effort provider revoke, then delete (tokens go with it) ──
export async function disconnect(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  try {
    const token = decryptSecret(account.accessTokenEnc);
    if (account.provider === "youtube") await google.revoke(token);
    else await meta.revoke(token);
  } catch {
    /* revoke is best-effort; deletion below removes our copy regardless */
  }
  await prisma.socialAccount.delete({ where: { id: accountId } });
  await invalidateAccount(accountId, userId);
  await recordAudit(userId, "social.disconnect", accountId, { provider: account.provider });
  return true;
}

// ── Read side: dashboard overview (token fields are never selected) ──────────
// TTL and cache keys live in ./cache, which owns every Redis key in the feature.

// Safe projection — note no accessTokenEnc / refreshTokenEnc anywhere.
const overviewSelect = {
  id: true,
  provider: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  followers: true,
  lastSyncedAt: true,
  lastSyncStatus: true,
  lastSyncError: true,
  posts: {
    orderBy: { publishedAt: "desc" as const },
    take: 12,
    select: {
      id: true, providerPostId: true, caption: true, thumbnailUrl: true, permalink: true,
      mediaType: true, publishedAt: true, views: true, likes: true, comments: true,
      shares: true, saves: true, reach: true, watchTimeSec: true,
    },
  },
  snapshots: {
    orderBy: { capturedAt: "asc" as const },
    take: 60,
    select: { capturedAt: true, followers: true, views: true, reach: true, engagement: true },
  },
} satisfies Prisma.SocialAccountSelect;

export async function getOverview(userId: string) {
  const version = await userVersion(userId);
  return cached(keys.overview(userId, version), CACHE_TTL, async () => ({
    accounts: await prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: overviewSelect,
    }),
  }));
}

/** @deprecated Use `invalidateUser` / `invalidateAccount` from ./cache. */
export async function invalidateOverview(userId: string): Promise<void> {
  await invalidateUser(userId);
}

/** @deprecated Key construction now lives in ./cache. */
export function analyticsCacheVersionKey(accountId: string): string {
  return keys.version(accountId);
}

// ── Refresh (manual / scheduled) ─────────────────────────────────────────────
export async function refreshAccount(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  await syncAccount(account); // already invalidates both versions
  await recordAudit(userId, "social.refresh", accountId, { provider: account.provider });
  return true;
}

export async function refreshAllForUser(userId: string): Promise<void> {
  const accounts = await prisma.socialAccount.findMany({ where: { userId } });
  for (const a of accounts) {
    try { await syncAccount(a); } catch (e) { logger.error("social", `sync failed for ${a.id}`, e); }
  }
  // syncAccount invalidates per account; bump once more so a run where every
  // account failed still refreshes the account list (statuses will have changed).
  await invalidateUser(userId);
}

// Refresh active accounts whose data is older than `maxAgeHours`. Drives both
// the scheduled BullMQ job and the /api/cron/social-refresh endpoint.
export async function refreshStaleAccounts(
  maxAgeHours = 12,
  limit = 50,
): Promise<{ refreshed: number; failed: number }> {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
  const accounts = await prisma.socialAccount.findMany({
    where: { status: "active", OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let refreshed = 0;
  let failed = 0;
  for (const a of accounts) {
    try {
      // syncAccount invalidates this account AND its owner's cross-account views
      // before returning. Doing it here rather than after the loop matters: an
      // account synced at iteration 3 of 50 used to keep serving pre-sync numbers
      // for the rest of the run.
      await syncAccount(a);
      refreshed++;
    } catch (e) {
      failed++;
      logger.error("social", `stale sync failed for ${a.id}`, e);
    }
  }
  return { refreshed, failed };
}

// ── Weekly email digest ──────────────────────────────────────────────────────
// One email per user with connected accounts: follower count, 7-day delta and
// posts published, per account. Driven by the weekly cron (?job=digest).
export async function sendWeeklyDigests(): Promise<{ sent: number }> {
  const { sendSocialDigestEmail } = await import("@/lib/email");
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const accounts = await prisma.socialAccount.findMany({
    where: { status: "active" },
    select: {
      id: true, provider: true, username: true, displayName: true, followers: true, userId: true,
      user: { select: { email: true, firstName: true } },
    },
  });

  const byUser = new Map<string, typeof accounts>();
  for (const a of accounts) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);

  let sent = 0;
  for (const [userId, userAccounts] of byUser) {
    const email = userAccounts[0].user.email;
    if (!email) continue;
    if (!(await shouldSendCategory(userId, "weeklySummary"))) continue;
    try {
      const rows = await Promise.all(
        userAccounts.map(async (a) => {
          const [baseline, postsThisWeek] = await Promise.all([
            prisma.socialAccountSnapshot.findFirst({
              where: { accountId: a.id, capturedAt: { lte: weekAgo } },
              orderBy: { capturedAt: "desc" },
              select: { followers: true },
            }),
            prisma.socialPost.count({ where: { accountId: a.id, publishedAt: { gte: weekAgo } } }),
          ]);
          return {
            platform: PROVIDERS[a.provider as ProviderId] ? a.provider.charAt(0).toUpperCase() + a.provider.slice(1) : a.provider,
            name: a.displayName || a.username || a.provider,
            followers: a.followers,
            followerDelta:
              a.followers !== null && baseline?.followers != null ? a.followers - baseline.followers : null,
            postsThisWeek,
          };
        }),
      );
      await sendSocialDigestEmail(email, userAccounts[0].user.firstName ?? "", rows);
      sent++;
    } catch (e) {
      logger.error("social", `digest failed for user ${userAccounts[0].userId}`, e);
    }
  }
  logger.info("social", "weekly digests sent", { sent });
  return { sent };
}

// ── Retention ────────────────────────────────────────────────────────────────
// Snapshots older than 90 days collapse to one per account per day (the day's
// latest). Charts past that horizon are daily-granularity anyway; this bounds
// table growth to ~365 rows/account/year. Runs from the weekly cron job.
export interface RetentionResult {
  /** Intra-day snapshot captures collapsed to one per day. */
  snapshots: number;
  /** Daily metric rows folded into monthly rollups. */
  dailyMetrics: number;
  /** Monthly rollup rows written back. */
  rollups: number;
  /** Audience captures collapsed to one per month. */
  audience: number;
  /** Competitor captures collapsed to one per day. */
  competitors: number;
}

/**
 * Time-series retention. Each table has a different shape and therefore a
 * different policy — collapsing them into one rule would either lose resolution
 * we need or keep rows nobody reads.
 *
 * Raw SQL throughout: `DISTINCT ON` is the right tool for "keep one row per
 * group" and Postgres-specific, which is fine here.
 */
export async function pruneTimeSeries(): Promise<RetentionResult> {
  // 1. Snapshots older than 90 days: keep one capture per day.
  const snapshots = await prisma.$executeRaw`
    DELETE FROM "SocialAccountSnapshot"
    WHERE "capturedAt" < NOW() - INTERVAL '90 days'
      AND id NOT IN (
        SELECT DISTINCT ON ("accountId", date_trunc('day', "capturedAt")) id
        FROM "SocialAccountSnapshot"
        WHERE "capturedAt" < NOW() - INTERVAL '90 days'
        ORDER BY "accountId", date_trunc('day', "capturedAt"), "capturedAt" DESC
      )`;

  // 2. Daily metrics older than 400 days roll up to one row per month.
  //    400 rather than 365 so a year-over-year comparison always has a complete
  //    prior year to compare against.
  //
  //    Sums for additive metrics; averages for rates, where summing would be
  //    nonsense. `followers` takes the month's last value because it is a level,
  //    not a flow. Written back as source='derived' so it is distinguishable
  //    from provider data, and ON CONFLICT so a re-run is idempotent.
  const rollups = await prisma.$executeRaw`
    INSERT INTO "SocialDailyMetric" (
      id, "accountId", date, impressions, reach, views, plays,
      followers, "followersGained", "followersLost", "profileViews", "websiteClicks",
      likes, comments, shares, saves, "totalInteractions", "accountsEngaged",
      "watchTimeSec", "avgViewDurationSec", "avgViewPercentage", ctr,
      "postsPublished", source, "fetchedAt"
    )
    SELECT
      gen_random_uuid()::text,
      "accountId",
      date_trunc('month', date)::date,
      SUM(impressions)::int, SUM(reach)::int, SUM(views)::int, SUM(plays)::int,
      (ARRAY_AGG(followers ORDER BY date DESC) FILTER (WHERE followers IS NOT NULL))[1],
      SUM("followersGained")::int, SUM("followersLost")::int,
      SUM("profileViews")::int, SUM("websiteClicks")::int,
      SUM(likes)::int, SUM(comments)::int, SUM(shares)::int, SUM(saves)::int,
      SUM("totalInteractions")::int, SUM("accountsEngaged")::int,
      SUM("watchTimeSec"),
      AVG("avgViewDurationSec"), AVG("avgViewPercentage"), AVG(ctr),
      SUM("postsPublished")::int,
      'derived', NOW()
    FROM "SocialDailyMetric"
    WHERE date < (NOW() - INTERVAL '400 days')::date AND source = 'provider'
    GROUP BY "accountId", date_trunc('month', date)
    ON CONFLICT ("accountId", date) DO NOTHING`;

  const dailyMetrics = await prisma.$executeRaw`
    DELETE FROM "SocialDailyMetric"
    WHERE date < (NOW() - INTERVAL '400 days')::date AND source = 'provider'`;

  // 3. Audience captures older than 180 days: keep one per month. Demographics
  //    move slowly, so monthly resolution loses nothing beyond that horizon.
  const audience = await prisma.$executeRaw`
    DELETE FROM "SocialAudienceSnapshot"
    WHERE "capturedAt" < NOW() - INTERVAL '180 days'
      AND id NOT IN (
        SELECT DISTINCT ON ("accountId", dimension, bucket, audience, date_trunc('month', "capturedAt")) id
        FROM "SocialAudienceSnapshot"
        WHERE "capturedAt" < NOW() - INTERVAL '180 days'
        ORDER BY "accountId", dimension, bucket, audience,
                 date_trunc('month', "capturedAt"), "capturedAt" DESC
      )`;

  // 4. Competitor captures older than 400 days: keep one per day.
  const competitors = await prisma.$executeRaw`
    DELETE FROM "CompetitorSnapshot"
    WHERE "capturedAt" < NOW() - INTERVAL '400 days'
      AND id NOT IN (
        SELECT DISTINCT ON ("competitorId", date_trunc('day', "capturedAt")) id
        FROM "CompetitorSnapshot"
        WHERE "capturedAt" < NOW() - INTERVAL '400 days'
        ORDER BY "competitorId", date_trunc('day', "capturedAt"), "capturedAt" DESC
      )`;

  const result = { snapshots, dailyMetrics, rollups, audience, competitors };
  logger.info("social", "time-series retention pruned", result);
  return result;
}

/** @deprecated Renamed to `pruneTimeSeries`, which also covers the new tables. */
export async function pruneOldSnapshots(): Promise<{ deleted: number }> {
  const { snapshots } = await pruneTimeSeries();
  return { deleted: snapshots };
}

// ── Audit trail ──────────────────────────────────────────────────────────────
// Token-touching actions are recorded per docs/social-tracker-security.md.
// AuditLog's actor column is named adminId, but the affiliate payout flow set
// the precedent of logging user-initiated actions under the acting user's id.
// Best-effort: an audit failure must never fail the underlying action.
async function recordAudit(
  userId: string,
  action: string,
  targetId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: userId,
        action,
        targetId: targetId ?? null,
        after: details ? JSON.stringify(details) : null,
      },
    });
  } catch (e) {
    logger.error("social", "audit log write failed", e);
  }
}

// ── Persistence helpers ──────────────────────────────────────────────────────
async function upsertAccount(userId: string, a: NormalizedAccount, tokens: OAuthTokens): Promise<SocialAccount> {
  const common = {
    username: a.username,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    tokenExpiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes,
    followers: a.metrics.followers ?? null,
    status: "active",
    lastSyncedAt: new Date(),
  };
  // Only overwrite the refresh token when the provider returned a new one.
  const refreshPatch = tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {};
  return prisma.socialAccount.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
      },
    },
    create: { userId, provider: a.provider, providerAccountId: a.providerAccountId, ...common, ...refreshPatch },
    update: { ...common, ...refreshPatch },
  });
}

async function persistSync(accountId: string, sync: ProviderSync): Promise<void> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      lastSyncStatus: sync.partialError ? "partial" : "ok",
      lastSyncError: sync.partialError ?? null,
    },
  });
  const m = sync.account.metrics;
  // Don't stack identical data points: a manual refresh minutes after the
  // scheduled one adds chart noise and rows, not information.
  const latest = await prisma.socialAccountSnapshot.findFirst({
    where: { accountId },
    orderBy: { capturedAt: "desc" },
  });
  const unchanged =
    latest &&
    Date.now() - latest.capturedAt.getTime() < 6 * 3600_000 &&
    latest.followers === (m.followers ?? null) &&
    latest.views === (m.views ?? null) &&
    latest.impressions === (m.impressions ?? null) &&
    latest.reach === (m.reach ?? null) &&
    latest.engagement === (m.engagement ?? null);
  if (!unchanged) {
    await prisma.socialAccountSnapshot.create({
      data: {
        accountId,
        followers: m.followers ?? null,
        views: m.views ?? null,
        impressions: m.impressions ?? null,
        reach: m.reach ?? null,
        engagement: m.engagement ?? null,
      },
    });
  }
  for (const p of sync.posts) {
    const data = {
      caption: p.caption,
      thumbnailUrl: p.thumbnailUrl,
      permalink: p.permalink,
      mediaType: p.mediaType,
      publishedAt: p.publishedAt,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      watchTimeSec: p.watchTimeSec,
      metricsJson: (p.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
      fetchedAt: new Date(),
    };
    await prisma.socialPost.upsert({
      where: { accountId_providerPostId: { accountId, providerPostId: p.providerPostId } },
      create: { accountId, providerPostId: p.providerPostId, ...data },
      update: data,
    });
  }
}
