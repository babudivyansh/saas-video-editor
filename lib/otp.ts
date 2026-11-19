import crypto from "crypto";
import { redis } from "./redis";
import { rateLimit, releaseRateLimit } from "./rate-limit";
import { sendOtpEmail, type DeliveryChannel, type OtpPurpose } from "./email";

export type { OtpPurpose };

const TTL_SECONDS = 600; // 10 minutes
/** Wrong guesses allowed against ONE code before it is burned. */
export const MAX_VERIFY_ATTEMPTS = 5;
/** A second request inside this window reuses the code already in the inbox. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Code EMAILS per purpose+address per hour (cooldown reuses don't count). */
export const MAX_SENDS_PER_HOUR = 5;

// Keyed by purpose so a code can only do the one thing it was sent for: a
// sign-in code can't finish a signup, and neither can stand in for the
// step-up code that guards account deletion.
function otpKey(purpose: OtpPurpose, email: string): string {
  return `otp:${purpose}:${email}`;
}
const attemptsKey = (p: OtpPurpose, e: string) => `otp:attempts:${p}:${e}`;
const cooldownKey = (p: OtpPurpose, e: string) => `otp:cooldown:${p}:${e}`;

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// ── At-rest hashing ─────────────────────────────────────────────────────────
// Codes used to sit in Redis in plain text, so anyone who could read Redis
// (a leaked REDIS_URL, a backup) could sign in as any user with a pending
// code. Now only an HMAC is stored, keyed by a secret Redis never sees, and
// bound to purpose + address. Stored as "h1:<hmac>:<expiresAtMs>" so a code
// can be put back with its remaining lifetime (see issueOtp).
function hmacKey(): string {
  return `otp-hmac:${process.env.JWT_SECRET ?? "dev-only-otp-key"}`;
}
function hashCode(purpose: OtpPurpose, email: string, code: string): string {
  return crypto.createHmac("sha256", hmacKey()).update(`${purpose}:${email}:${code}`).digest("hex");
}
function encodeStored(hash: string, expiresAt: number): string {
  return `h1:${hash}:${expiresAt}`;
}

function matches(stored: string, purpose: OtpPurpose, email: string, submitted: string): boolean {
  if (stored.startsWith("h1:")) {
    const [, hash] = stored.split(":");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(hashCode(purpose, email, submitted), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // A plain code written before this change (≤ 10 minutes old at deploy).
  const a = Buffer.from(stored);
  const b = Buffer.from(submitted);
  // timingSafeEqual throws on length mismatch rather than just returning
  // false, and the length itself isn't a secret here (codes are always the
  // same length), so compare lengths first the normal way.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Seconds left on a stored value, for putting a previous code back. */
function remainingSeconds(stored: string): number {
  if (!stored.startsWith("h1:")) return TTL_SECONDS;
  const exp = Number(stored.split(":")[2]);
  return Number.isFinite(exp) ? Math.floor((exp - Date.now()) / 1000) : 0;
}

/** Thrown when a code could not actually be delivered in production. */
export class OtpDeliveryError extends Error {
  constructor() {
    super("Couldn't send the code");
    this.name = "OtpDeliveryError";
  }
}

/**
 * Too many codes emailed to one address for one purpose this hour. A
 * subclass, so every route's existing `instanceof OtpDeliveryError` branch
 * answers it — with the same wording whether or not the account exists.
 */
export class OtpThrottledError extends OtpDeliveryError {
  constructor() {
    super();
    this.name = "OtpThrottledError";
  }
}

/**
 * Generates a 6-digit code, stores its hash (10-min TTL) and emails it.
 *
 * Returns the fields a route may add to its JSON response. Outside
 * production, when no email provider is configured, that includes the code
 * itself so local dev and CI e2e can sign in. In production it never does:
 * a code that didn't go out by email throws OtpDeliveryError instead, so the
 * caller answers with an error rather than a success that leaks the code.
 * (The removed SMS path returned the code in production whenever Twilio was
 * unset or failed — anyone could sign in as anyone by phone number.)
 *
 * Flood protection:
 *  - Within RESEND_COOLDOWN_SECONDS of a code that was emailed, a repeat
 *    request sends nothing and keeps that code valid — the person already
 *    has it. The response is identical, so this reveals nothing.
 *  - At most MAX_SENDS_PER_HOUR emails per purpose+address per hour.
 *  - If delivery fails, the PREVIOUS code (if any) is put back, so a
 *    provider outage can't invalidate a code that is already in the inbox.
 */
export async function issueOtp(
  purpose: OtpPurpose,
  email: string,
): Promise<{ devCode?: string }> {
  const key = otpKey(purpose, email);
  const previous = await redis.get(key);

  if (previous && remainingSeconds(previous) > 0 && (await redis.get(cooldownKey(purpose, email)))) {
    return {};
  }

  const hourly = await rateLimit(`otp-send:${purpose}:${email}`, MAX_SENDS_PER_HOUR, 3600);
  if (!hourly.allowed) throw new OtpThrottledError();

  const code = generateOtp();
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  await redis.set(key, encodeStored(hashCode(purpose, email, code), expiresAt), "EX", TTL_SECONDS);
  await redis.del(attemptsKey(purpose, email));

  const channel: DeliveryChannel = await sendOtpEmail(email, code, purpose);

  if (channel === "failed") {
    // A provider outage must not use up the person's hourly allowance.
    await releaseRateLimit(`otp-send:${purpose}:${email}`);
    const left = previous ? remainingSeconds(previous) : 0;
    if (previous && left > 0) await redis.set(key, previous, "EX", left);
    else await redis.del(key);
  } else if (channel === "email") {
    await redis.set(cooldownKey(purpose, email), "1", "EX", RESEND_COOLDOWN_SECONDS);
  }
  return otpResponseExtras(channel, code);
}

export function otpResponseExtras(channel: DeliveryChannel, code: string): { devCode?: string } {
  if (channel === "email") return {};
  if (process.env.NODE_ENV === "production") throw new OtpDeliveryError();
  return channel === "dev-console" ? { devCode: code } : {};
}

/**
 * Verifies a submitted code and consumes it (single-use).
 *
 * Each wrong guess counts against THIS code; after MAX_VERIFY_ATTEMPTS the
 * code is deleted and a new one must be requested. (The routes' own rate
 * limits still apply on top, per address and per IP.) Consumption is a
 * GETDEL, so of two simultaneous correct submissions only one succeeds.
 */
export async function consumeOtp(purpose: OtpPurpose, email: string, otp: unknown): Promise<boolean> {
  if (typeof otp !== "string" && typeof otp !== "number") return false;
  const key = otpKey(purpose, email);
  const stored = await redis.get(key);
  if (!stored) return false;

  const submitted = String(otp).trim();
  if (!matches(stored, purpose, email, submitted)) {
    const tries = await redis.incrWithExpire(attemptsKey(purpose, email), TTL_SECONDS);
    if (tries >= MAX_VERIFY_ATTEMPTS) {
      await redis.del(key);
      await redis.del(attemptsKey(purpose, email));
    }
    return false;
  }

  // Replay-safe: only the caller whose GETDEL returns this exact value wins.
  const taken = await redis.getdel(key);
  if (taken !== stored) return false;
  await redis.del(attemptsKey(purpose, email));
  await redis.del(cooldownKey(purpose, email));
  return true;
}
