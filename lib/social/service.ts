import { Prisma, type SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { createState, makePkce } from "./oauth";
import * as google from "./google";
import * as meta from "./meta";
import { PROVIDERS } from "./providers";
import { classifyError, withRetry } from "./errors";
import type { NormalizedAccount, OAuthProvider, OAuthTokens, ProviderId, ProviderSync } from "./types";
import { logger } from "@/lib/logger";

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
    await invalidateAnalytics(account.id);
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
  await invalidateOverview(userId);
  await invalidateAnalytics(accountId);
  await recordAudit(userId, "social.disconnect", accountId, { provider: account.provider });
  return true;
}

// ── Read side: dashboard overview (token fields are never selected) ──────────
const OVERVIEW_TTL = 300; // seconds

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
  const cacheKey = `social:overview:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through to refetch */ }
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: overviewSelect,
  });
  const payload = { accounts };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", OVERVIEW_TTL);
  return payload;
}

export async function invalidateOverview(userId: string): Promise<void> {
  await redis.del(`social:overview:${userId}`);
}

// Computed-analytics cache (app/api/social/analytics) — one key per range.
async function invalidateAnalytics(accountId: string): Promise<void> {
  await Promise.all([7, 30, 90].map((r) => redis.del(`social:analytics:${accountId}:${r}`)));
}

// ── Refresh (manual / scheduled) ─────────────────────────────────────────────
export async function refreshAccount(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  await syncAccount(account);
  await invalidateOverview(userId);
  await recordAudit(userId, "social.refresh", accountId, { provider: account.provider });
  return true;
}

export async function refreshAllForUser(userId: string): Promise<void> {
  const accounts = await prisma.socialAccount.findMany({ where: { userId } });
  for (const a of accounts) {
    try { await syncAccount(a); } catch (e) { logger.error("social", `sync failed for ${a.id}`, e); }
  }
  await invalidateOverview(userId);
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
  const affected = new Set<string>();
  for (const a of accounts) {
    try {
      await syncAccount(a);
      refreshed++;
      affected.add(a.userId);
    } catch (e) {
      failed++;
      logger.error("social", `stale sync failed for ${a.id}`, e);
    }
  }
  for (const uid of affected) await invalidateOverview(uid);
  return { refreshed, failed };
}

// ── Retention ────────────────────────────────────────────────────────────────
// Snapshots older than 90 days collapse to one per account per day (the day's
// latest). Charts past that horizon are daily-granularity anyway; this bounds
// table growth to ~365 rows/account/year. Runs from the weekly cron job.
export async function pruneOldSnapshots(): Promise<{ deleted: number }> {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "SocialAccountSnapshot"
    WHERE "capturedAt" < NOW() - INTERVAL '90 days'
      AND id NOT IN (
        SELECT DISTINCT ON ("accountId", date_trunc('day', "capturedAt")) id
        FROM "SocialAccountSnapshot"
        WHERE "capturedAt" < NOW() - INTERVAL '90 days'
        ORDER BY "accountId", date_trunc('day', "capturedAt"), "capturedAt" DESC
      )`;
  logger.info("social", "snapshot retention pruned", { deleted });
  return { deleted };
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
