import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "./redis";
import { prisma } from "./prisma";
import { env } from "@/lib/env";
import type { TierId } from "@/lib/plans/tiers";

const JWT_SECRET = env.JWT_SECRET;
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

export const SESSION_COOKIE_NAME = "session";

export interface TokenPayload {
  userId: string;
  email: string;
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

export async function cacheSession(userId: string, token: string): Promise<void> {
  await redis.set(`session:${userId}`, token, "EX", SESSION_TTL);
}

export async function invalidateSession(userId: string): Promise<void> {
  await redis.del(`session:${userId}`);
}

export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const cached = await redis.get(`session:${payload.userId}`);
    if (!cached || cached !== token) return null;
    return payload;
  } catch {
    return null;
  }
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
 * "acting as this user"). A revoked key always fails closed.
 */
export async function getApiKeyAuth(req: NextRequest): Promise<ApiKeyAuth | null> {
  const authHeader = req.headers.get("authorization");
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!key || !key.startsWith(API_KEY_PREFIX)) return null;

  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
  if (!row || row.revokedAt) return null;

  // Best-effort — a slow/failed write here shouldn't fail the actual request.
  void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

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
