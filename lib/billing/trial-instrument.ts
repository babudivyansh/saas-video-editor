// One free trial per card or UPI ID, not just per account.
//
// The Pro trial is already once per account and once per inbox
// (lib/billing/trial-eligibility.ts). Neither stops a fresh account on a fresh
// inbox from authorising the same card again. The card (or UPI ID) is only
// known once the customer has approved the mandate, so this runs inside
// startTrialOnAuthentication: a trial whose instrument already backed another
// account's trial is rejected there, which cancels the subscription before it
// can ever charge (the ₹5 authorisation is auto-refunded).
//
// IDENTITY. Razorpay exposes no card fingerprint, so a card is identified by
// what it does return on a payment or saved token: network, issuer, last 4
// digits and expiry month/year. Two different people sharing all five is
// vanishingly rare (same bank and network, 1 in 10,000 on the digits, and the
// same expiry month). A card without expiry details is NOT fingerprinted,
// because last 4 + bank alone would wrongly block real customers. A UPI ID is
// exact. Net banking / e-mandate isn't covered.
//
// STORAGE. Only an HMAC of that identity (keyed with the server secret) is
// kept, so the table can't be read back into card details.

import { createHmac } from "crypto";
import type Razorpay from "razorpay";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** The fields this needs from a Razorpay payment entity. */
export interface PaymentLike {
  method?: string | null;
  vpa?: string | null;
  upi?: { vpa?: string | null } | null;
  card?: CardLike | null;
}

/** The fields this needs from a Razorpay customer token entity. */
export interface TokenLike {
  method?: string | null;
  recurring?: boolean | null;
  created_at?: number | null;
  card?: CardLike | null;
  vpa?: { username?: string | null; handle?: string | null } | null;
}

interface CardLike {
  network?: string | null;
  issuer?: string | null;
  last4?: string | null;
  expiry_month?: number | string | null;
  expiry_year?: number | string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function cardIdentity(card: CardLike | null | undefined): string | null {
  if (!card) return null;
  const network = norm(card.network);
  const last4 = norm(card.last4);
  const month = Number(card.expiry_month);
  const year = Number(card.expiry_year);
  if (!network || !/^\d{4}$/.test(last4) || !(month >= 1 && month <= 12) || !(year >= 2000)) return null;
  return `card|${network}|${norm(card.issuer)}|${last4}|${month}/${year}`;
}

function upiIdentity(vpa: string | null | undefined): string | null {
  const v = norm(vpa);
  return /^[^@\s]+@[^@\s]+$/.test(v) ? `upi|${v}` : null;
}

/** The raw identity string for a payment, or null when it can't be told apart safely. */
export function paymentIdentity(p: PaymentLike | null | undefined): string | null {
  if (!p) return null;
  return cardIdentity(p.card) ?? upiIdentity(p.vpa ?? p.upi?.vpa ?? null);
}

/** The raw identity string for a saved customer token. */
export function tokenIdentity(t: TokenLike | null | undefined): string | null {
  if (!t) return null;
  const vpa = t.vpa?.username && t.vpa?.handle ? `${t.vpa.username}@${t.vpa.handle}` : null;
  return cardIdentity(t.card) ?? upiIdentity(vpa);
}

/** What gets stored and compared: an HMAC of the identity, never the identity itself. */
export function fingerprint(identity: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`trial-instrument:${identity}`).digest("hex");
}

/**
 * The fingerprint of the card/UPI ID that authorised a trial subscription, from
 * the best source available: the payment the caller already has (the checkout
 * callback's verified payment, or the webhook's payment entity), a payment id
 * to fetch, or the customer's newest recurring token. Null when none of them
 * identifies the instrument — the trial then proceeds on the account and inbox
 * checks alone. Never throws.
 */
export async function resolveTrialFingerprint(
  rp: Razorpay,
  sub: { customer_id?: string | null },
  source: { payment?: PaymentLike | null; paymentId?: string | null } = {},
): Promise<string | null> {
  try {
    let identity = paymentIdentity(source.payment);
    if (!identity && source.paymentId) {
      const payment = (await rp.payments.fetch(source.paymentId)) as unknown as PaymentLike;
      identity = paymentIdentity(payment);
    }
    if (!identity && sub.customer_id) {
      const tokens = (await rp.customers.fetchTokens(sub.customer_id)) as unknown as { items?: TokenLike[] };
      const newest = (tokens.items ?? [])
        .filter((t) => t.recurring !== false)
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
      identity = tokenIdentity(newest);
    }
    return identity ? fingerprint(identity) : null;
  } catch (e) {
    logger.warn("billing/trial", "could not identify the trial's card/UPI ID; skipping the per-instrument check", e);
    return null;
  }
}
