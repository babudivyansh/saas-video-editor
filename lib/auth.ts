import jwt from "jsonwebtoken";
import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "./redis";
import { prisma } from "./prisma";
import { env } from "@/lib/env";
import { describeDevice } from "@/lib/device";
import { getClientIp } from "@/lib/rate-limit";
import type { TierId } from "@/lib/plans/tiers";

const JWT_SECRET = env.JWT_SECRET;
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

export const SESSION_COOKIE_NAME = "session";

export interface TokenPayload {
  userId: string;
  email: string;
  sessionId: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Sets the httpOnly session cookie alongside the Bearer token flow. Mirrors
 * the JWT's own expiry so the cookie never outlives the token it carries.
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

// ── Multi-session support ───────────────────────────────────────────────
// A user can now have several concurrent valid sessions (one per device),
// where the old scheme had exactly one (logging in anywhere silently killed
// every other device). Each user's active sessions live under a single Redis
// key as a JSON array: lib/redis.ts's shared wrapper only exposes get/set/del
// (no native Set command, and no Set support in its in-memory fallback), so a
// read-modify-write array is the pattern that actually fits it, rather than
// bolting on a new Redis primitive for this one feature.
//
// Deploying this is a one-time breaking change for whoever's already logged
// in: existing tokens have no `sessionId` claim, getAuthUser below rejects
// those outright rather than trying to bridge old/new formats, and every
// user is prompted to log in again. Intentional — patching around it would
// add real complexity to a security-sensitive path for a self-resolving,
// one-time inconvenience.

export interface SessionInfo {
  sessionId: string;
  device: string;
  ip: string | null;
  country: string | null;
  createdAt: number; // epoch ms
  lastSeenAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

interface SessionRecord extends SessionInfo {
  tokenHash: string; // sha256 of the JWT — never the raw token, so a Redis snapshot/log leak can't be replayed directly
}

function sessionsKey(userId: string): string {
  return `sessions:${userId}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readSessions(userId: string): Promise<SessionRecord[]> {
  const raw = await redis.get(sessionsKey(userId));
  if (!raw) return [];
  let records: SessionRecord[];
  try {
    records = JSON.parse(raw);
  } catch {
    return [];
  }
  const now = Date.now();
  return records.filter((r) => r.expiresAt > now);
}

async function writeSessions(userId: string, records: SessionRecord[]): Promise<void> {
  if (records.length === 0) {
    await redis.del(sessionsKey(userId));
    return;
  }
  await redis.set(sessionsKey(userId), JSON.stringify(records), "EX", SESSION_TTL);
}

export interface SessionMeta {
  device: string;
  ip: string | null;
  country: string | null;
}

/** Registers a newly-issued token as one active session among possibly several. */
export async function cacheSession(userId: string, sessionId: string, token: string, meta: SessionMeta): Promise<void> {
  const now = Date.now();
  const records = await readSessions(userId);
  records.push({
    sessionId,
    tokenHash: hashToken(token),
    device: meta.device,
    ip: meta.ip,
    country: meta.country,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  });
  await writeSessions(userId, records);
}

/** Every active session for a user, newest-activity first, never exposing the token hash. */
export async function listSessions(userId: string): Promise<SessionInfo[]> {
  const records = await readSessions(userId);
  return records
    .map(({ tokenHash, ...info }) => { void tokenHash; return info; })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function invalidateOneSession(userId: string, sessionId: string): Promise<void> {
  const records = await readSessions(userId);
  await writeSessions(userId, records.filter((r) => r.sessionId !== sessionId));
}

/** Kills every session, or every session except one (e.g. the one that just changed the password). */
export async function invalidateAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  if (!exceptSessionId) {
    await redis.del(sessionsKey(userId));
    return;
  }
  const records = await readSessions(userId);
  await writeSessions(userId, records.filter((r) => r.sessionId === exceptSessionId));
}

// Back-compat name for admin call sites that want everything gone (suspend,
// incident-response "revoke all") — they never had per-session granularity
// and still don't need it.
export async function invalidateSession(userId: string): Promise<void> {
  await invalidateAllSessions(userId);
}

/** Best-effort activity timestamp bump — never awaited by the caller, never fails the auth check it runs alongside. */
function touchSession(userId: string, sessionId: string): void {
  readSessions(userId).then((records) => {
    const match = records.find((r) => r.sessionId === sessionId);
    if (!match || Date.now() - match.lastSeenAt < 5 * 60 * 1000) return; // throttle writes to once per 5min per session
    match.lastSeenAt = Date.now();
    return writeSessions(userId, records);
  }).catch(() => { /* best-effort */ });
}

export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    if (!payload.sessionId) return null; // pre-migration token shape — reject rather than silently trust
    const records = await readSessions(payload.userId);
    const match = records.find((r) => r.sessionId === payload.sessionId);
    if (!match || match.tokenHash !== hashToken(token)) return null;
    touchSession(payload.userId, payload.sessionId);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Completes a login (password, phone/email OTP, or Google OAuth) — issues a
 * session-bound JWT and registers it with device/IP metadata. The one place
 * every login-completing route shares, so device capture and session
 * issuance can't drift between them the way duplicated inline logic would.
 *
 * Deliberately does NOT do the IP→country geo lookup here (that's a network
 * call to a third party) — login/route.ts already does that lookup itself
 * for the sign-in alert email; call updateSessionCountry from within that
 * existing fire-and-forget block instead of doubling the external request.
 */
export async function completeLogin(
  req: NextRequest,
  user: { id: string; email: string },
): Promise<{ token: string; sessionId: string; device: string; ip: string | null }> {
  const sessionId = randomUUID();
  const token = signToken({ userId: user.id, email: user.email, sessionId });
  const device = describeDevice(req.headers.get("user-agent") ?? "");
  const rawIp = getClientIp(req);
  const ip = rawIp === "unknown" ? null : rawIp;

  await cacheSession(user.id, sessionId, token, { device, ip, country: null });
  return { token, sessionId, device, ip };
}

/** Backfills the country on an already-cached session once an async geo lookup resolves. */
export async function updateSessionCountry(userId: string, sessionId: string, country: string): Promise<void> {
  const records = await readSessions(userId);
  const match = records.find((r) => r.sessionId === sessionId);
  if (!match) return;
  match.country = country;
  await writeSessions(userId, records);
}

/**
 * Resolves the caller and confirms they are an ADMIN.
 * Role is read from Postgres per-request (not embedded in the JWT) so a
 * promotion/demotion takes effect immediately without re-issuing tokens.
 * Returns the token payload for admins, or null otherwise (caller should 403).
 */
export async function requireAdmin(req: NextRequest): Promise<TokenPayload | null> {
  const auth = await getAuthUser(req);
  if (!auth) return null;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  return user?.role === "ADMIN" ? auth : null;
}

/**
 * Resolves the caller and confirms they have an active subscription. Used to
 * gate subscriber-only features (e.g. Social Tracker). Subscription state is
 * read from Postgres per-request so expiry/upgrades take effect immediately.
 * Returns the token payload for active subscribers, or null otherwise.
 */
export async function requireSubscriber(req: NextRequest): Promise<TokenPayload | null> {
  const auth = await getAuthUser(req);
  if (!auth) return null;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { subscriptionEndsAt: true },
  });
  const active = !!user?.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
  return active ? auth : null;
}

const API_KEY_PREFIX = "sk_live_";

function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mints a new public-API key. Returns the plaintext exactly once — callers
 * must show it to the user immediately and store only `hash`/`prefix`
 * (ApiKey.keyHash/keyPrefix). There is no way to recover the plaintext later.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 12) };
}

export interface ApiKeyAuth {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

/**
 * Resolves the caller of a public /api/v1/** request via its API key —
 * separate from getAuthUser's session-cookie/JWT flow, since these are two
 * different trust boundaries (a leaked API key shouldn't grant the same
 * access surface as a browser session, even though both currently resolve to
 * "acting as this user"). A revoked or expired key always fails closed.
 */
export async function getApiKeyAuth(req: NextRequest): Promise<ApiKeyAuth | null> {
  const authHeader = req.headers.get("authorization");
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!key || !key.startsWith(API_KEY_PREFIX)) return null;

  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  // Best-effort — a slow/failed write here shouldn't fail the actual request.
  void prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
  }).catch(() => {});

  return { userId: row.userId, apiKeyId: row.id, scopes: row.scopes };
}

/**
 * Resolves a user's plan tier for model-access gating (see lib/credits.ts's
 * checkModelAccess). "free" is returned for no plan, an expired subscription,
 * or a plan row with no tier (packs/addons never carry one) — it's a
 * sentinel, not a purchasable Plan row. Read from Postgres per-request, same
 * reasoning as requireAdmin/requireSubscriber above (expiry/upgrades take
 * effect immediately without re-issuing tokens).
 */
export async function getUserTier(userId: string): Promise<TierId> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionEndsAt: true, plan: { select: { tier: true } } },
  });
  const active = !!user?.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
  if (!active || !user?.plan?.tier) return "free";
  return user.plan.tier as TierId;
}
