// The short-lived ticket that carries a login across the second-factor step.
//
// Password (or OTP, or Google) checks out but the account has 2FA on, so no
// session is issued yet — instead the server mints an opaque ticket, and
// app/api/auth/2fa/verify-login exchanges it plus a TOTP/recovery code for the
// real session. The ticket IS the credential proving the first factor already
// passed, which is why verify-login is deliberately unauthenticated (and why
// it must be listed in lib/api-public-routes.ts).
//
// Centralised here because three separate routes mint one — login,
// verify-otp, and account/reactivate — and each previously carried its own
// copy of the TTL and key format, which is exactly how the three drift apart.

import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";

const TICKET_TTL_SECONDS = 300; // 5 minutes to reach for the authenticator app
const MAX_ATTEMPTS = 5;

const ticketKey = (ticket: string) => `2fa-pending:${ticket}`;
const attemptsKey = (ticket: string) => `2fa-attempts:${ticket}`;

export interface TwoFactorTicket {
  userId: string;
  /**
   * Set by account/reactivate. The deactivation is only lifted once the
   * second factor passes — lifting it before, as reactivate used to, let the
   * password alone cancel a deactivation (and its scheduled purge).
   */
  reactivate?: boolean;
}

export async function mintTwoFactorTicket(userId: string, opts: { reactivate?: boolean } = {}): Promise<string> {
  const ticket = randomUUID();
  const value: TwoFactorTicket = { userId, ...(opts.reactivate ? { reactivate: true } : {}) };
  await redis.set(ticketKey(ticket), JSON.stringify(value), "EX", TICKET_TTL_SECONDS);
  return ticket;
}

/** What this ticket stands for, or null if it expired / was spent. */
export async function readTwoFactorTicket(ticket: string): Promise<TwoFactorTicket | null> {
  const raw = await redis.get(ticketKey(ticket));
  if (!raw) return null;
  // Tickets minted before this change stored the bare user id.
  if (!raw.startsWith("{")) return { userId: raw };
  try {
    const parsed = JSON.parse(raw) as TwoFactorTicket;
    return typeof parsed.userId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Burns the ticket (and its attempt counter) — success or lockout alike. */
export async function discardTwoFactorTicket(ticket: string): Promise<void> {
  await Promise.all([redis.del(ticketKey(ticket)), redis.del(attemptsKey(ticket))]);
}

/**
 * Counts one wrong code against the ticket and reports whether that used up
 * the last attempt (in which case the ticket has already been burned and the
 * user must start the login over).
 *
 * This is the brute-force defense that actually holds: verify-login's IP-keyed
 * rate limit derives the IP from the client-supplied X-Forwarded-For header
 * (lib/rate-limit.ts's getClientIp), so an attacker holding a valid ticket can
 * rotate it freely and guess unthrottled. The counter lives on the ticket,
 * which they cannot forge.
 */
export async function countFailedTwoFactorAttempt(ticket: string): Promise<{ lockedOut: boolean }> {
  const attempts = await redis.incrWithExpire(attemptsKey(ticket), TICKET_TTL_SECONDS);
  if (attempts >= MAX_ATTEMPTS) {
    await discardTwoFactorTicket(ticket);
    return { lockedOut: true };
  }
  return { lockedOut: false };
}
