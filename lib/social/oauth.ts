import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "@/lib/redis";
import type { OAuthProvider } from "./types";
import { env } from "@/lib/env";

// OAuth handshake helpers shared by every provider. Two anti-abuse mechanisms:
//   1. `state` — a short-lived JWT signed with JWT_SECRET carrying the userId, so
//      the callback (a top-level browser redirect with no Authorization header)
//      can be tied back to the user who initiated it (CSRF/replay protection).
//   2. PKCE — a per-attempt code_verifier kept server-side in Redis (never in the
//      browser) and exchanged alongside the auth code.

const JWT_SECRET = env.JWT_SECRET;
const STATE_TTL = 600; // seconds (10 min) — both the JWT and the Redis verifier

interface StatePayload {
  userId: string;
  provider: string; // the requested ProviderId (e.g. "instagram")
  nonce: string;
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

// Mint the signed state and stash the PKCE verifier under its nonce.
export async function createState(userId: string, provider: string, verifier: string): Promise<string> {
  const nonce = crypto.randomBytes(12).toString("hex");
  await redis.set(`social:pkce:${nonce}`, verifier, "EX", STATE_TTL);
  const payload: StatePayload = { userId, provider, nonce };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: STATE_TTL });
}

// Verify state + atomically consume the one-time PKCE verifier.
export async function consumeState(
  state: string,
): Promise<{ userId: string; provider: string; verifier: string } | null> {
  try {
    const payload = jwt.verify(state, JWT_SECRET) as StatePayload;
    const verifier = await redis.get(`social:pkce:${payload.nonce}`);
    if (!verifier) return null;
    await redis.del(`social:pkce:${payload.nonce}`); // single use
    return { userId: payload.userId, provider: payload.provider, verifier };
  } catch {
    return null;
  }
}
