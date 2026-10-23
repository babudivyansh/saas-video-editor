import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "@/lib/redis";
import type { OAuthProvider } from "./types";
import { env } from "@/lib/env";

// OAuth handshake helpers shared by every provider. Three anti-abuse mechanisms:
//   1. `state` — a short-lived JWT signed with JWT_SECRET carrying the userId, so
//      the callback (a top-level browser redirect with no Authorization header)
//      can be tied back to the user who initiated it (CSRF/replay protection).
//   2. PKCE — a per-attempt code_verifier kept server-side in Redis (never in the
//      browser) and exchanged alongside the auth code.
//   3. Browser binding. A signed state alone says WHO started the connect, not
//      WHERE: an attacker could start a connect on their own account and send
//      the provider sign-in link to a victim, whose YouTube/Instagram would then
//      land on the attacker's Clipiro account. So the state is only honoured
//      in the browser that started it:
//        - web: connect sets an httpOnly cookie holding the state's nonce,
//          scoped to the callback path, and the callback requires it to match;
//        - app: the phone opens the sign-in in a Custom Tab that has none of our
//          cookies, so the callback doesn't finish the connect at all. It parks
//          the code under a one-time id and hands that to the app
//          (clipiro://social?pending=…), which finishes it with its own Bearer
//          session — and only if that session is the user who started it.

const JWT_SECRET = env.JWT_SECRET;
const STATE_TTL = 600; // seconds (10 min) — the JWT, the Redis verifier and the browser cookie

/** The httpOnly cookie binding a web connect to the browser that started it. */
export const OAUTH_BROWSER_COOKIE = "social_oauth_nonce";
/** Path-scoped, so the cookie is only ever sent to the callback. */
export const OAUTH_BROWSER_COOKIE_OPTIONS = {
  httpOnly: true,
  // lax, not strict: the callback is a top-level GET arriving from the
  // provider's site, which strict would strip the cookie from.
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/social/callback",
  maxAge: STATE_TTL,
};

/** Who started the connect: the web dashboard, or the phone app (mobile Phase 11.2). */
export type OAuthClient = "web" | "app";

interface StatePayload {
  userId: string;
  provider: string; // the requested ProviderId (e.g. "instagram")
  nonce: string;
  /** Absent = web (every state minted before the app existed). */
  client?: "app";
}

export function appUrl(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

// Exact redirect URI registered with the provider; one per OAuth app.
export function redirectUri(oauthProvider: OAuthProvider): string {
  return `${appUrl()}/api/social/callback/${oauthProvider}`;
}

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// Mint the signed state and stash the PKCE verifier under its nonce. The nonce
// is what a web connect puts in OAUTH_BROWSER_COOKIE.
export async function createState(
  userId: string,
  provider: string,
  verifier: string,
  client: OAuthClient = "web",
): Promise<{ state: string; nonce: string }> {
  const nonce = crypto.randomBytes(12).toString("hex");
  await redis.set(`social:pkce:${nonce}`, verifier, "EX", STATE_TTL);
  const payload: StatePayload = { userId, provider, nonce, ...(client === "app" ? { client: "app" as const } : {}) };
  return { state: jwt.sign(payload, JWT_SECRET, { expiresIn: STATE_TTL }), nonce };
}

function sameNonce(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Verify state + atomically consume the one-time PKCE verifier. A web state
 * also needs `browserNonce` (the OAUTH_BROWSER_COOKIE this request carried) to
 * match; without it the state is refused and NOT consumed, so a link forced on
 * someone else's browser can't burn the real owner's attempt either.
 */
export async function consumeState(
  state: string,
  browserNonce: string | undefined,
): Promise<{ userId: string; provider: string; verifier: string; client: OAuthClient } | null> {
  try {
    const payload = jwt.verify(state, JWT_SECRET) as StatePayload;
    const client: OAuthClient = payload.client === "app" ? "app" : "web";
    if (client === "web" && !(browserNonce && sameNonce(payload.nonce, browserNonce))) return null;
    const verifier = await redis.getdel(`social:pkce:${payload.nonce}`); // single use
    if (!verifier) return null;
    return { userId: payload.userId, provider: payload.provider, verifier, client };
  } catch {
    return null;
  }
}

/** A phone connect the callback parked for the app to finish (see the header). */
export interface PendingAppConnect {
  userId: string;
  provider: string;
  oauthProvider: OAuthProvider;
  code: string;
  verifier: string;
}

const pendingKey = (id: string) => `social:app-pending:${id}`;

export async function parkAppConnect(pending: PendingAppConnect): Promise<string> {
  const id = crypto.randomBytes(24).toString("base64url");
  await redis.set(pendingKey(id), JSON.stringify(pending), "EX", STATE_TTL);
  return id;
}

/** One-time: the first caller gets it, whoever they are, so check the user before using it. */
export async function takeAppConnect(id: string): Promise<PendingAppConnect | null> {
  const raw = await redis.getdel(pendingKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAppConnect;
  } catch {
    return null;
  }
}

/**
 * Who started a connect, read from a state that is NOT consumed (the callback's
 * error paths, where the provider sent the person back without a code). Only a
 * validly signed state can send the browser to the app; anything else goes to
 * the web dashboard, as before.
 */
export function stateClient(state: string | null): OAuthClient {
  if (!state) return "web";
  try {
    return (jwt.verify(state, JWT_SECRET) as StatePayload).client === "app" ? "app" : "web";
  } catch {
    return "web";
  }
}
