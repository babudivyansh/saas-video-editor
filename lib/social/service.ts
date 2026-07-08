import { Prisma, type SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { createState, makePkce } from "./oauth";
import * as google from "./google";
import * as meta from "./meta";
import type { NormalizedAccount, OAuthProvider, OAuthTokens, ProviderId, ProviderSync } from "./types";
import { logger } from "@/lib/logger";

// Which OAuth app a requested platform authenticates through.
export function oauthProviderFor(provider: ProviderId): OAuthProvider {
  return provider === "youtube" ? "youtube" : "meta";
}

// ── Connect: build the provider authorize URL ────────────────────────────────
export async function buildAuthUrl(userId: string, provider: ProviderId): Promise<string> {
  const { verifier, challenge } = makePkce();
  const state = await createState(userId, provider, verifier);
  return oauthProviderFor(provider) === "youtube"
    ? google.getAuthUrl(state, challenge)
    : meta.getAuthUrl(state, challenge);
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
    return ["youtube"];
  }

  // Meta: one grant can yield several accounts (Pages + linked IG). Each stores
  // its own long-lived Page token; the user token's expiry is the re-auth hint.
  const userTokens = await meta.exchangeCode(code, verifier);
  const connected = await meta.fetchAccounts(userTokens.accessToken);
  const providers = new Set<ProviderId>();
  for (const c of connected) {
    const tokens: OAuthTokens = {
      accessToken: c.pageAccessToken,
      expiresAt: userTokens.expiresAt,
      scopes: userTokens.scopes,
    };
    const sync = await meta
      .syncAccount(c.account.providerAccountId, c.account.provider as "facebook" | "instagram", c.pageAccessToken)
      .catch(() => ({ account: c.account, posts: [] }) as ProviderSync);
    const account = await upsertAccount(userId, sync.account, tokens);
    await persistSync(account.id, sync);
    providers.add(c.account.provider);
  }
  if (providers.size === 0) throw new Error("no Facebook Pages or Instagram accounts found");
  return [...providers];
}

// ── Token lifecycle ──────────────────────────────────────────────────────────
// Returns a usable access token, transparently refreshing (and re-persisting)
// when it is within 60s of expiry. Marks the account needs_reauth on failure.
export async function getValidAccessToken(account: SocialAccount): Promise<string> {
  const expiringSoon =
    !!account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (!expiringSoon) return decryptSecret(account.accessTokenEnc);

  if (!account.refreshTokenEnc) {
    await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "needs_reauth" } });
    throw new Error("access token expired and no refresh token is stored");
  }
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const tokens = await refreshFor(account.provider as ProviderId, refreshToken);
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

function refreshFor(provider: ProviderId, refreshToken: string): Promise<OAuthTokens> {
  if (provider === "youtube") return google.refreshAccessToken(refreshToken);
  throw new Error(`refresh not supported for provider "${provider}" yet`);
}

// ── Re-sync an existing account (manual refresh / scheduled job) ──────────────
export async function syncAccount(account: SocialAccount): Promise<void> {
  const accessToken = await getValidAccessToken(account);
  const sync: ProviderSync =
    account.provider === "youtube"
      ? await google.sync(accessToken)
      : await meta.syncAccount(account.providerAccountId, account.provider as "facebook" | "instagram", accessToken);

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

// ── Refresh (manual / scheduled) ─────────────────────────────────────────────
export async function refreshAccount(userId: string, accountId: string): Promise<boolean> {
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  await syncAccount(account);
  await invalidateOverview(userId);
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
  const m = sync.account.metrics;
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
