import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimUnverifiedAccount } from "@/lib/account-claim";
import { cleanName, NAME_MAX } from "@/lib/auth-validation";
import { logger } from "@/lib/logger";
import { grantFreeTierMinutes } from "@/lib/minutes";
import { attributeReferral } from "@/lib/affiliate";
import { getClientIp } from "@/lib/rate-limit";

// Google sign-in after Google has vouched for the person — shared by the web
// redirect flow (app/api/auth/callback/google) and the Android app's ID-token
// exchange (app/api/mobile/v1/auth/google), so account linking and the
// account gates can't drift between them.

export interface GoogleProfile {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export type GoogleSignInResult =
  | { kind: "signed-in"; user: User; isNewUser: boolean }
  | { kind: "error"; error: string; status: number; reason: "no-email" | "unverified-email" | "suspended" | "deactivated" }
  | { kind: "2fa"; user: User };

export async function signInWithGoogleProfile(req: NextRequest, profile: GoogleProfile): Promise<GoogleSignInResult> {
  const email = profile.email?.toLowerCase();
  const name =
    cleanName(profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ")).slice(0, NAME_MAX) || null;
  const avatarUrl = profile.picture;

  if (!email) {
    return { kind: "error", reason: "no-email", error: "Email not provided by Google account", status: 400 };
  }

  // Account-linking by email is takeover-adjacent: a Google account whose
  // email is unverified could otherwise link into (or create) an account on
  // an address its owner never proved control of. Anything but an explicit
  // true (false, or the field missing) is refused. ID tokens carry it as a
  // boolean; some older tokens carried the string "true".
  if (profile.email_verified !== true && profile.email_verified !== "true") {
    return { kind: "error", reason: "unverified-email", error: "Your Google email address is not verified.", status: 400 };
  }

  let user = await prisma.user.findUnique({ where: { email } });

  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    // Secure random hash for password since they log in via Google
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    user = await prisma.user.create({
      data: {
        email,
        name,
        avatarUrl,
        passwordHash,
        // The hash above is random and never shown to anyone, so this
        // account has no password its owner knows — sensitive actions step
        // up with an emailed code instead (lib/step-up.ts).
        hasPassword: false,
        // Signup grant lands in the bonus bucket (30-day expiry); the
        // monthly free-tier drip is anchored one month out from signup.
        credits: 10,
        bonusCredits: 10,
        bonusCreditsExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        freeCreditsRefillAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        // Google already proves control of this inbox — no separate
        // verify-email round trip needed for a Google signup.
        emailVerifiedAt: new Date(),
      },
    });

    // The free tier's Clip Minutes, through the ledgered helper (a raw column
    // write here would leave refunds nothing to restore against). Best-effort:
    // a failed grant must not fail the signup — the monthly drip retries it.
    const newUserId = user.id;
    await grantFreeTierMinutes(newUserId, "grant:signup").catch((e) =>
      logger.error("auth", `signup minutes grant failed for ${newUserId}`, e));

    // Google doesn't collect a typed code, so this is cookie-attribution
    // only — the helper degrades gracefully (the app has no cookie).
    await attributeReferral({
      cookieCode: req.cookies.get("affiliate_ref")?.value ?? null,
      typedCode: null,
      email,
      newUser: { id: user.id, name },
      // The rightmost trusted hop, not the client-supplied leftmost one.
      signupIp: (() => { const ip = getClientIp(req); return ip === "unknown" ? null : ip; })(),
    });
  } else {
    // Existing account. If its address was never verified, whoever created
    // it may not own the inbox — they could have registered this address
    // first, set the password and even 2FA, waiting for the real owner to
    // sign in with Google. The Google sign-in is the first proof of the
    // inbox, so the account is claimed clean: password, 2FA and every
    // session are dropped (lib/account-claim.ts).
    if (!user.emailVerifiedAt) {
      await claimUnverifiedAccount(user.id);
    }
    // Backfill the avatar if they had none.
    if (avatarUrl && !user.avatarUrl) {
      await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    }
    user = (await prisma.user.findUnique({ where: { id: user.id } }))!;
  }

  // Same account gates as /api/auth/login — proving control of the Google
  // inbox authenticates the *first* factor and nothing more. Without these,
  // any account whose email matched a Google account skipped 2FA outright,
  // and suspended/deactivated accounts signed straight back in.
  if (user.suspendedAt) {
    return { kind: "error", reason: "suspended", error: "This account has been suspended. Contact support if you believe this is a mistake.", status: 403 };
  }
  if (user.deactivatedAt) {
    return { kind: "error", reason: "deactivated", error: "This account is deactivated.", status: 403 };
  }
  if (user.twoFactorEnabled) return { kind: "2fa", user };
  return { kind: "signed-in", user, isNewUser };
}

// ── ID tokens (native Google Sign-In) ─────────────────────────────────────
// Verified against Google's published signing certificates, with the issuer,
// audience (our OAuth client IDs) and expiry checked by jsonwebtoken.

const CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Google certs fetch failed: ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  const certs = (await res.json()) as Record<string, string>;
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };
  return certs;
}

/** For tests: forget the cached certificates. */
export function resetGoogleCertCache() {
  certCache = null;
}

export class GoogleTokenError extends Error {}

/** Verifies a Google ID token and returns its profile claims. */
export async function verifyGoogleIdToken(idToken: string, audiences: string[]): Promise<GoogleProfile> {
  if (audiences.length === 0) throw new GoogleTokenError("Google sign-in is not configured");
  const jwt = (await import("jsonwebtoken")).default;
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw new GoogleTokenError("Malformed Google token");
  const cert = (await googleCerts())[kid];
  if (!cert) throw new GoogleTokenError("Unknown Google signing key");
  try {
    return jwt.verify(idToken, cert, {
      algorithms: ["RS256"],
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: audiences as [string, ...string[]],
    }) as GoogleProfile;
  } catch (e) {
    throw new GoogleTokenError(e instanceof Error ? e.message : "Invalid Google token");
  }
}
