// Suppression list and delivery log.
//
// Kept out of send.ts so the transport stays readable, and so the webhook can
// reuse exactly the same write paths the sender uses.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type SuppressionReason = "hard_bounce" | "complaint" | "manual";

/**
 * Is this address suppressed?
 *
 * Never throws. A database blip must not stop transactional email — a receipt
 * that fails to send is a worse outcome than one sent to an address we should
 * have skipped, and the next webhook will re-assert the suppression anyway.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const row = await prisma.emailSuppression.findUnique({ where: { email }, select: { email: true } });
    return row !== null;
  } catch (err) {
    logger.error("email:suppression", `lookup failed for ${email}`, err);
    return false;
  }
}

/** Idempotent: a redelivered webhook must not error, and the first reason wins. */
export async function suppress(
  email: string,
  reason: SuppressionReason,
  detail?: string,
): Promise<void> {
  try {
    await prisma.emailSuppression.upsert({
      where: { email },
      create: { email, reason, detail },
      update: {},
    });
    logger.info("email:suppression", `suppressed ${email} (${reason})`);
  } catch (err) {
    logger.error("email:suppression", `could not suppress ${email}`, err);
  }
}

/** Manual un-suppression, for support to undo a false positive. */
export async function unsuppress(email: string): Promise<void> {
  try {
    await prisma.emailSuppression.delete({ where: { email } });
  } catch {
    // Already absent is the desired end state, not an error.
  }
}

export interface LogInput {
  recipient: string;
  templateId: string;
  status: string;
  channel?: string | null;
  providerMessageId?: string | null;
  userId?: string | null;
  error?: string | null;
}

/**
 * Record one send attempt.
 *
 * Never throws, for the same reason as the transport itself: several callers
 * fire email without awaiting, and an audit-trail failure must not become an
 * unhandled rejection that takes down the request that triggered it.
 */
export async function logEmail(input: LogInput): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        recipient: input.recipient,
        templateId: input.templateId,
        status: input.status,
        channel: input.channel ?? null,
        providerMessageId: input.providerMessageId ?? null,
        userId: input.userId ?? null,
        error: input.error ?? null,
      },
    });
  } catch (err) {
    logger.error("email:log", `could not record ${input.templateId} -> ${input.recipient}`, err);
  }
}

/**
 * Update a row from a provider webhook.
 *
 * Matched on the provider's message id. A webhook for a message we have no row
 * for — sent before this table existed, or from another environment sharing the
 * domain — is ignored rather than treated as an error.
 */
export async function markDelivery(
  providerMessageId: string,
  status: "delivered" | "bounced" | "complained",
  error?: string,
): Promise<void> {
  try {
    await prisma.emailLog.updateMany({
      where: { providerMessageId },
      data: { status, ...(error ? { error } : {}) },
    });
  } catch (err) {
    logger.error("email:log", `could not mark ${providerMessageId} ${status}`, err);
  }
}
