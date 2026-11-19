// The message-level layer over routeEmail: one EmailMessage row per send,
// idempotency, the "pause non-critical" switch, and durable deferred retry.
//
// Retry policy, by priority:
//   critical (codes, password reset) — never deferred. A code that arrives an
//     hour late has expired; the person presses "resend" instead, which is a
//     new, correct email. Failing fast is the right behaviour.
//   high / normal — when no provider can take it right now (quota, outage),
//     the rendered message is stored ENCRYPTED and retried by the
//     email-maintenance cron with exponential backoff + jitter, surviving
//     restarts. After MAX_RETRIES it is dead-lettered (status failed, payload
//     wiped) and stays visible on Admin → Email.
//   Never retried at all: a bad address (permanent) or an unknown outcome
//     (it may already have been delivered).

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { maskEmail } from "@/lib/mask-email";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { PAUSE_NONCRITICAL_KEY } from "./config";
import { dbAlertSink } from "./alerts";
import { routeEmail, type RouteResult, type RouterDeps } from "./router";
import { prismaRouterStore } from "./store";
import { brevoProvider } from "./providers/brevo";
import { mailjetProvider } from "./providers/mailjet";
import { resendProvider } from "./providers/resend";
import type { EmailPriority, OutboundAttachment, OutboundEmail, ProviderName } from "./types";

export const MAX_RETRIES = 6;
const BASE_DELAY_MS = 5 * 60_000;
const MAX_DELAY_MS = 4 * 60 * 60_000;

export const PROVIDERS = { brevo: brevoProvider, mailjet: mailjetProvider, resend: resendProvider } as const;

/**
 * The router's own database was unusable BEFORE any provider was called — so
 * nothing was sent, and the caller may safely use the legacy transport.
 */
export class RouterUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super("email router unavailable before sending");
    this.name = "RouterUnavailableError";
  }
}

export function defaultDeps(): RouterDeps {
  return { store: prismaRouterStore, alerts: dbAlertSink, providers: PROVIDERS };
}

/** Exponential backoff with ±20% jitter, capped. retryCount is 0-based. */
export function nextRetryDelayMs(retryCount: number, rand: () => number = Math.random): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** retryCount, MAX_DELAY_MS);
  return Math.round(base * (0.8 + rand() * 0.4));
}

export interface DeliverInput {
  templateId: string;
  priority: EmailPriority;
  userId?: string | null;
  idempotencyKey?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  replyTo?: string;
  attachments?: OutboundAttachment[];
}

export interface DeliverResult {
  status: "sent" | "failed" | "unknown" | "deferred" | "duplicate";
  provider: ProviderName | null;
  providerMessageId: string | null;
  emailMessageId: string;
  error?: string;
}

interface StoredPayload {
  to: string; subject: string; html: string; text: string; headers: Record<string, string>; replyTo?: string;
  attachments?: { filename: string; contentType: string; content: string }[];
}

function sealPayload(i: Pick<DeliverInput, "to" | "subject" | "html" | "text" | "headers" | "replyTo" | "attachments">): string {
  const p: StoredPayload = {
    to: i.to, subject: i.subject, html: i.html, text: i.text, headers: i.headers, replyTo: i.replyTo,
    attachments: i.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content.toString("base64") })),
  };
  return encryptSecret(JSON.stringify(p));
}

function openPayload(sealed: string): StoredPayload {
  return JSON.parse(decryptSecret(sealed)) as StoredPayload;
}

export async function isNoncriticalPaused(): Promise<boolean> {
  try {
    const row = await prisma.config.findUnique({ where: { key: PAUSE_NONCRITICAL_KEY } });
    return row ? JSON.parse(row.value) === true : false;
  } catch {
    return false;
  }
}

/** Write the route result onto the message; defer or dead-letter as policy says. */
async function settle(
  id: string,
  priority: EmailPriority,
  r: RouteResult,
  prior: { retryCount: number; attemptCount: number; sealed: () => string | null },
): Promise<DeliverResult> {
  const now = new Date();
  const common = {
    attemptCount: prior.attemptCount + r.attempts,
    fallbackUsed: r.fallbackUsed,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
  };

  if (r.status === "accepted") {
    await prisma.emailMessage.update({
      where: { id },
      data: {
        ...common, status: "accepted", provider: r.provider, providerMessageId: r.providerMessageId,
        acceptedAt: now, latencyMs: r.latencyMs, payloadEncrypted: null, nextAttemptAt: null,
        errorCode: null, errorMessage: null,
      },
    });
    return { status: "sent", provider: r.provider, providerMessageId: r.providerMessageId, emailMessageId: id };
  }

  if (r.status === "unknown") {
    await prisma.emailMessage.update({
      where: { id },
      data: { ...common, status: "unknown", provider: r.provider, payloadEncrypted: null, nextAttemptAt: null },
    });
    return { status: "unknown", provider: r.provider, providerMessageId: null, emailMessageId: id, error: r.errorMessage ?? undefined };
  }

  const canRetry = !r.permanent && priority !== "critical" && prior.retryCount < MAX_RETRIES;
  const sealed = canRetry ? prior.sealed() : null;
  if (canRetry && sealed) {
    await prisma.emailMessage.update({
      where: { id },
      data: {
        ...common, status: "deferred", payloadEncrypted: sealed,
        nextAttemptAt: new Date(now.getTime() + nextRetryDelayMs(prior.retryCount)),
      },
    });
    return { status: "deferred", provider: null, providerMessageId: null, emailMessageId: id, error: r.errorMessage ?? undefined };
  }

  await prisma.emailMessage.update({
    where: { id },
    data: { ...common, status: "failed", failedAt: now, payloadEncrypted: null, nextAttemptAt: null },
  });
  return { status: "failed", provider: r.provider, providerMessageId: null, emailMessageId: id, error: r.errorMessage ?? r.errorCode ?? "failed" };
}

/** Send one rendered email through the router. Throws only on a DB failure; the caller catches. */
export async function deliver(input: DeliverInput, deps: RouterDeps = defaultDeps()): Promise<DeliverResult> {
  let id: string;
  try {
    const early = await prepare(input);
    if ("result" in early) return early.result;
    id = early.id;
  } catch (err) {
    throw new RouterUnavailableError(err);
  }

  const email: OutboundEmail = {
    messageId: id, to: input.to, subject: input.subject, html: input.html, text: input.text,
    headers: input.headers, replyTo: input.replyTo, attachments: input.attachments, templateId: input.templateId,
  };
  const r = await routeEmail(email, input.priority, deps);
  try {
    return await settle(id, input.priority, r, { retryCount: 0, attemptCount: 0, sealed: () => sealPayload(input) });
  } catch (err) {
    // A provider may already have taken it: report the routing outcome as-is
    // and let the stalled-send sweep mark the row, rather than throwing (which
    // would invite the caller to send it again some other way).
    logger.error("email:deliver", `could not record outcome of ${id}`, err);
    return {
      status: r.status === "accepted" ? "sent" : r.status === "unknown" ? "unknown" : "failed",
      provider: r.provider, providerMessageId: r.providerMessageId, emailMessageId: id, error: r.errorMessage ?? undefined,
    };
  }
}

/** DB work before any provider is touched: idempotency check and the message row. */
async function prepare(input: DeliverInput): Promise<{ result: DeliverResult } | { id: string }> {
  if (input.idempotencyKey) {
    const existing = await prisma.emailMessage.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing && existing.status !== "failed") {
      return {
        result: {
          status: "duplicate", provider: (existing.provider as ProviderName | null) ?? null,
          providerMessageId: existing.providerMessageId, emailMessageId: existing.id,
        },
      };
    }
    if (existing) {
      // A previous FAILED try frees the key for this one.
      await prisma.emailMessage.update({ where: { id: existing.id }, data: { idempotencyKey: null } });
    }
  }

  const id = crypto.randomUUID();
  const paused = input.priority === "normal" && (await isNoncriticalPaused());

  await prisma.emailMessage.create({
    data: {
      id, userId: input.userId ?? null, recipientEmail: input.to, templateId: input.templateId,
      subject: input.subject, priority: input.priority, status: paused ? "deferred" : "sending",
      idempotencyKey: input.idempotencyKey ?? null,
      ...(paused ? { payloadEncrypted: sealPayload(input), nextAttemptAt: new Date(Date.now() + BASE_DELAY_MS) } : {}),
    },
  });
  if (paused) return { result: { status: "deferred", provider: null, providerMessageId: null, emailMessageId: id } };
  return { id };
}

/**
 * Retry due deferred messages. Called by the email-maintenance cron.
 * Claims each row with a conditional update first, so two overlapping cron
 * runs cannot both send the same message.
 */
export async function processDeferred(
  opts: { limit?: number; isSuppressed?: (email: string) => Promise<boolean> } = {},
  deps: RouterDeps = defaultDeps(),
): Promise<{ processed: number; sent: number; deferred: number; failed: number }> {
  const paused = await isNoncriticalPaused();
  const due = await prisma.emailMessage.findMany({
    where: {
      status: "deferred", nextAttemptAt: { lte: new Date() },
      ...(paused ? { priority: { not: "normal" } } : {}),
    },
    orderBy: [{ priority: "asc" }, { nextAttemptAt: "asc" }],
    take: opts.limit ?? 25,
    select: { id: true, priority: true, retryCount: true, attemptCount: true, templateId: true, payloadEncrypted: true },
  });
  const tally = { processed: 0, sent: 0, deferred: 0, failed: 0 };

  for (const m of due) {
    const claimed = await prisma.emailMessage.updateMany({
      where: { id: m.id, status: "deferred" },
      data: { status: "sending", retryCount: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    tally.processed += 1;

    let payload: StoredPayload;
    try {
      if (!m.payloadEncrypted) throw new Error("no payload");
      payload = openPayload(m.payloadEncrypted);
    } catch (err) {
      logger.error("email:retry", `cannot open deferred ${m.id}`, err);
      await prisma.emailMessage.update({
        where: { id: m.id },
        data: { status: "failed", failedAt: new Date(), payloadEncrypted: null, errorCode: "payload_unreadable" },
      });
      tally.failed += 1;
      continue;
    }

    if (opts.isSuppressed && (await opts.isSuppressed(payload.to))) {
      await prisma.emailMessage.update({ where: { id: m.id }, data: { status: "suppressed", payloadEncrypted: null } });
      continue;
    }

    const email: OutboundEmail = {
      messageId: m.id, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text,
      headers: payload.headers, replyTo: payload.replyTo, templateId: m.templateId,
      attachments: payload.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content, "base64") })),
    };
    const priority = m.priority as EmailPriority;
    try {
      const r = await routeEmail(email, priority, deps);
      const res = await settle(m.id, priority, r, {
        retryCount: m.retryCount + 1, attemptCount: m.attemptCount, sealed: () => m.payloadEncrypted,
      });
      if (res.status === "sent") tally.sent += 1;
      else if (res.status === "deferred") tally.deferred += 1;
      else tally.failed += 1;
      if (res.status === "failed") {
        logger.warn("email:retry", `dead-lettered ${m.templateId} -> ${maskEmail(payload.to)} after ${m.retryCount + 1} retries`);
      }
    } catch (err) {
      // Put it back for the next run rather than losing it.
      logger.error("email:retry", `retry of ${m.id} threw`, err);
      await prisma.emailMessage.update({
        where: { id: m.id },
        data: { status: "deferred", nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(m.retryCount)) },
      }).catch(() => undefined);
    }
  }
  return tally;
}
