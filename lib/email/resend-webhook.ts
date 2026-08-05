// Svix signature verification for Resend webhooks.
//
// Implemented against node:crypto rather than pulling in the `svix` package for
// a single route. The scheme is small and stable, and the repo already verifies
// Razorpay's webhook by hand in exactly this shape
// (app/api/webhooks/razorpay/route.ts).
//
// Svix signs `${id}.${timestamp}.${body}` with the base64 secret that follows
// the "whsec_" prefix, and sends the result base64 in a space-separated list of
// `v1,<sig>` entries — a list because secrets can be rotated with an overlap
// window, so more than one signature may be valid at once.

import crypto from "node:crypto";

/** Reject anything older than this, so a captured request cannot be replayed. */
export const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerifyFailure =
  | "missing-secret"
  | "missing-headers"
  | "bad-timestamp"
  | "stale-timestamp"
  | "no-match";

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

export function verifySvixSignature(
  body: string,
  headers: SvixHeaders,
  secret: string | undefined,
  now: Date = new Date(),
): VerifyResult {
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing-headers" };
  }

  const sentAt = Number(headers.timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "bad-timestamp" };

  const driftSeconds = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (driftSeconds > TOLERANCE_SECONDS) return { ok: false, reason: "stale-timestamp" };

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest("base64");

  // Constant-time compare against each offered signature. A plain === here would
  // leak the correct value one byte at a time.
  const expectedBuf = Buffer.from(expected);
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const candidate = Buffer.from(value);
    if (candidate.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(candidate, expectedBuf)) return { ok: true };
  }

  return { ok: false, reason: "no-match" };
}

/** The Resend event shapes this app acts on. */
export interface ResendEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string };
  };
}

export interface ParsedEvent {
  kind: "delivered" | "bounced" | "complained" | "ignored";
  messageId: string | null;
  recipients: string[];
  /** True only for a permanent failure — a soft bounce must not suppress. */
  permanent: boolean;
}

export function parseResendEvent(event: ResendEvent): ParsedEvent {
  const messageId = event.data?.email_id ?? null;
  const raw = event.data?.to;
  const recipients = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);

  switch (event.type) {
    case "email.delivered":
      return { kind: "delivered", messageId, recipients, permanent: false };
    case "email.bounced": {
      // Resend reports "hard" | "soft" | "undetermined". Only a hard bounce
      // means the address does not exist; suppressing on a soft bounce would
      // permanently drop users over a temporarily full mailbox.
      const permanent = event.data?.bounce?.type === "hard";
      return { kind: "bounced", messageId, recipients, permanent };
    }
    case "email.complained":
      // A spam complaint is always permanent. Continuing to mail someone who
      // pressed "report spam" is the single fastest way to lose domain
      // reputation, and it is also simply what they asked for.
      return { kind: "complained", messageId, recipients, permanent: true };
    default:
      return { kind: "ignored", messageId, recipients, permanent: false };
  }
}
