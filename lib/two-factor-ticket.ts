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

export async function mintTwoFactorTicket(userId: string): Promise<string> {
  const ticket = randomUUID();
  await redis.set(ticketKey(ticket), userId, "EX", TICKET_TTL_SECONDS);
  return ticket;
}

/** The user id this ticket stands for, or null if it expired / was spent. */
export async function readTwoFactorTicket(ticket: string): Promise<string | null> {
  return redis.get(ticketKey(ticket));
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
