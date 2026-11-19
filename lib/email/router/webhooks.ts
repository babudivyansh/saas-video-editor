// Delivery-status webhooks for all three providers.
//
// Each provider signs (or doesn't) differently, so authentication is per
// provider; everything after that is shared:
//
//   1. record the event under a provider-specific dedupe key — a redelivery of
//      an event already APPLIED is acknowledged and skipped; one that was
//      received but whose processing crashed is applied again;
//   2. find our message: by our own id (Mailjet CustomID, Brevo tag) first,
//      then by the provider's message id;
//   3. move its status FORWARD only (accepted < deferred < delivered <
//      bounced/failed < complained), so out-of-order events can't regress it;
//   4. suppress the address on a permanent bounce or a complaint.
//
// "Delivered" means the receiving mail server took it — not that anyone
// opened it. Opens and clicks are deliberately ignored.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { markDelivery, suppress } from "@/lib/email/suppression";
import type { ProviderName } from "./types";

export type DeliveryKind = "accepted" | "delivered" | "deferred" | "bounced" | "complained" | "failed" | "ignored";

export interface DeliveryEvent {
  provider: ProviderName;
  /** Unique per event (not per message). */
  eventKey: string;
  eventType: string;
  kind: DeliveryKind;
  providerMessageId: string | null;
  /** Our EmailMessage id, when the provider echoes it back. */
  emailMessageId: string | null;
  recipient: string | null;
  occurredAt: Date | null;
  /** Bounce/complaint that should stop all future mail to the address. */
  permanent: boolean;
  detail?: string;
}

const RANK: Record<string, number> = {
  pending: 0, sending: 0, unknown: 0, deferred: 2, accepted: 1, delivered: 3, bounced: 4, failed: 4, complained: 5,
};
const KIND_STATUS: Record<Exclude<DeliveryKind, "ignored">, string> = {
  accepted: "accepted", delivered: "delivered", deferred: "deferred", bounced: "bounced", complained: "complained", failed: "failed",
};

/** Would this event move the message forward? Exported for tests. */
export function advances(current: string, kind: DeliveryKind): boolean {
  if (kind === "ignored") return false;
  // A provider-side "deferred" (soft bounce, greylisting) after acceptance is
  // still progress; our own "deferred" (waiting to retry) is not overridden
  // by a provider's accepted/deferred for a different attempt.
  return (RANK[KIND_STATUS[kind]] ?? 0) > (RANK[current] ?? 0);
}

// ── Authentication ─────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/**
 * Shared-secret check for providers that don't sign payloads. Accepts
 * `Authorization: Bearer <secret>` (Brevo's token auth) or Basic auth whose
 * password is the secret (Mailjet's credentials-in-URL, Brevo's basic auth).
 * Fails closed when no secret is configured.
 */
export function verifySharedSecret(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const [scheme, value] = authorization.split(" ", 2);
  if (!value) return false;
  if (/^bearer$/i.test(scheme)) return safeEqual(value.trim(), secret);
  if (/^basic$/i.test(scheme)) {
    const decoded = Buffer.from(value.trim(), "base64").toString("utf8");
    const password = decoded.slice(decoded.indexOf(":") + 1);
    return decoded.includes(":") && safeEqual(password, secret);
  }
  return false;
}

// ── Parsing ────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

export function parseBrevoEvent(raw: Record<string, unknown>): DeliveryEvent | null {
  const event = str(raw.event);
  if (!event) return null;
  const providerMessageId = str(raw["message-id"]);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  const ourTag = tags.find((t) => t.startsWith("msg:"));
  const ts = typeof raw.ts_epoch === "number" ? raw.ts_epoch : typeof raw.ts_event === "number" ? raw.ts_event * 1000 : null;
  const kind: DeliveryKind = ({
    request: "accepted",
    delivered: "delivered",
    deferred: "deferred",
    soft_bounce: "deferred",
    hard_bounce: "bounced",
    invalid_email: "bounced",
    blocked: "failed",
    error: "failed",
    spam: "complained",
    complaint: "complained",
  } as Record<string, DeliveryKind>)[event] ?? "ignored";
  return {
    provider: "brevo",
    eventKey: `${providerMessageId ?? str(raw.id) ?? "?"}:${event}:${ts ?? str(raw.date) ?? ""}`,
    eventType: event,
    kind,
    providerMessageId,
    emailMessageId: ourTag ? ourTag.slice(4) : null,
    recipient: str(raw.email),
    occurredAt: ts ? new Date(ts) : null,
    permanent: event === "hard_bounce" || event === "invalid_email" || event === "spam" || event === "complaint",
    detail: str(raw.reason) ?? undefined,
  };
}

export function parseMailjetEvent(raw: Record<string, unknown>): DeliveryEvent | null {
  const event = str(raw.event);
  if (!event) return null;
  const providerMessageId = str(raw.MessageID);
  const time = typeof raw.time === "number" ? raw.time : null;
  const hard = raw.hard_bounce === true;
  const kind: DeliveryKind = ({
    sent: "delivered", // Mailjet's "sent" = accepted by the recipient's server
    bounce: hard ? "bounced" : "deferred",
    blocked: "failed",
    spam: "complained",
  } as Record<string, DeliveryKind>)[event] ?? "ignored";
  return {
    provider: "mailjet",
    eventKey: `${providerMessageId ?? str(raw.Message_GUID) ?? "?"}:${event}:${time ?? ""}`,
    eventType: event,
    kind,
    providerMessageId,
    emailMessageId: str(raw.CustomID),
    recipient: str(raw.email),
    occurredAt: time ? new Date(time * 1000) : null,
    permanent: (event === "bounce" && hard) || event === "spam",
    detail: [str(raw.error_related_to), str(raw.error)].filter(Boolean).join(": ") || undefined,
  };
}

/** Resend events, mapped onto the shared shape (signature checked by the route). */
export function parseResendDelivery(svixId: string, raw: {
  type?: string; created_at?: string;
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string }; tags?: Record<string, string> | { name: string; value: string }[] };
}): DeliveryEvent | null {
  if (!raw.type) return null;
  const to = raw.data?.to;
  const recipient = Array.isArray(to) ? to[0] ?? null : to ?? null;
  const tags = raw.data?.tags;
  const msgTag = Array.isArray(tags) ? tags.find((t) => t.name === "msg")?.value : tags?.msg;
  const hard = raw.data?.bounce?.type === "hard" || raw.data?.bounce?.type === "Permanent";
  const kind: DeliveryKind = ({
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "deferred",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
  } as Record<string, DeliveryKind>)[raw.type] ?? "ignored";
  return {
    provider: "resend",
    eventKey: svixId,
    eventType: raw.type,
    kind,
    providerMessageId: raw.data?.email_id ?? null,
    emailMessageId: msgTag ?? null,
    recipient,
    occurredAt: raw.created_at ? new Date(raw.created_at) : null,
    permanent: raw.type === "email.complained" || (raw.type === "email.bounced" && hard),
  };
}

// ── Applying ───────────────────────────────────────────────────────────────

export type ApplyResult = "applied" | "duplicate" | "unmatched" | "ignored" | "stale";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Apply one event. Throws on a database failure — the route turns that into
 * a 500 so the provider retries, and the dedupe row (processedAt still null)
 * lets the retry through.
 */
export async function applyDeliveryEvent(e: DeliveryEvent): Promise<ApplyResult> {
  const existing = await prisma.emailWebhookEvent.findUnique({
    where: { provider_eventKey: { provider: e.provider, eventKey: e.eventKey } },
  });
  if (existing?.processedAt) return "duplicate";
  const row = existing ?? await prisma.emailWebhookEvent.create({
    data: {
      provider: e.provider, eventKey: e.eventKey, eventType: e.eventType,
      providerMessageId: e.providerMessageId, occurredAt: e.occurredAt,
    },
  }).catch(async (err: unknown) => {
    // Two deliveries of the same event racing: the other one owns it.
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  });
  if (!row) return "duplicate";

  let result: ApplyResult = "ignored";
  if (e.kind !== "ignored") {
    const message =
      (e.emailMessageId && UUID_RE.test(e.emailMessageId)
        ? await prisma.emailMessage.findUnique({ where: { id: e.emailMessageId } })
        : null) ??
      (e.providerMessageId
        ? await prisma.emailMessage.findFirst({ where: { providerMessageId: e.providerMessageId }, orderBy: { createdAt: "desc" } })
        : null);

    if (!message) {
      result = "unmatched";
    } else if (!advances(message.status, e.kind)) {
      result = "stale";
    } else {
      const at = e.occurredAt ?? new Date();
      const status = KIND_STATUS[e.kind as Exclude<DeliveryKind, "ignored">];
      // Conditional on the status we read, so two events racing can't
      // regress each other.
      await prisma.emailMessage.updateMany({
        where: { id: message.id, status: message.status },
        data: {
          status,
          ...(e.kind === "accepted" && !message.acceptedAt ? { acceptedAt: at, provider: e.provider } : {}),
          ...(e.kind === "delivered" ? { deliveredAt: at } : {}),
          ...(e.kind === "bounced" || e.kind === "failed" ? { failedAt: at, errorCode: e.eventType } : {}),
          ...(e.providerMessageId && !message.providerMessageId ? { providerMessageId: e.providerMessageId } : {}),
          ...(message.status === "unknown" ? { provider: e.provider } : {}),
        },
      });
      result = "applied";
    }

    // The pre-router audit log (EmailLog) is keyed by provider message id.
    if (e.providerMessageId && (e.kind === "delivered" || e.kind === "bounced" || e.kind === "complained")) {
      await markDelivery(e.providerMessageId, e.kind, e.detail);
    }
    if (e.permanent && e.recipient) {
      await suppress(e.recipient.toLowerCase(), e.kind === "complained" ? "complaint" : "hard_bounce", `${e.provider}:${e.eventType}`);
    }
  }

  await prisma.emailWebhookEvent.update({
    where: { id: row.id },
    data: { processedAt: new Date(), matched: result === "applied" || result === "stale" },
  });
  return result;
}

/** Apply a batch; one bad event doesn't stop the rest, but any DB failure is rethrown after. */
export async function applyAll(events: DeliveryEvent[], tag: string): Promise<Record<ApplyResult, number>> {
  const tally: Record<ApplyResult, number> = { applied: 0, duplicate: 0, unmatched: 0, ignored: 0, stale: 0 };
  let failure: unknown = null;
  for (const e of events) {
    try {
      tally[await applyDeliveryEvent(e)] += 1;
    } catch (err) {
      logger.error(tag, `could not apply ${e.eventType} ${e.eventKey}`, err);
      failure = err;
    }
  }
  if (failure) throw failure;
  return tally;
}
