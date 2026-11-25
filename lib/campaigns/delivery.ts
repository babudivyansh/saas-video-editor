// What happened to a campaign's emails after a provider took them: delivered,
// bounced, marked as spam, or still waiting for the provider to say.
//
// Two records exist, both kept current by the provider webhooks
// (lib/email/router/webhooks.ts):
//   EmailMessage  the router's message, found by the idempotency key the
//                 sender set: campaign:<campaignId>:<userId>. Covers mail the
//                 router queued and sent later, which never got a message id
//                 on the recipient row.
//   EmailLog      the older per-send log, found by provider message id. Used
//                 for sends that went out without the router.

import { prisma } from "@/lib/prisma";

import type { CampaignDelivery, DeliveryBucket } from "./delivery-types";

export type { CampaignDelivery, DeliveryBucket };

/** Router (EmailMessage) and log (EmailLog) statuses → one bucket. */
export function deliveryBucket(status: string | null | undefined): DeliveryBucket {
  switch (status) {
    case "delivered":
      return "delivered";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "failed":
    case "suppressed":
      return "failed";
    case "pending":
    case "sending":
    case "accepted":
    case "deferred":
    case "unknown":
    case "sent":
      return "pending";
    default:
      return "untracked";
  }
}

export function campaignKey(campaignId: string, userId: string): string {
  return `campaign:${campaignId}:${userId}`;
}

const CHUNK = 1000;

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

export async function campaignDelivery(campaignId: string): Promise<CampaignDelivery> {
  const recipients = await prisma.emailCampaignRecipient.findMany({
    where: { campaignId, status: { in: ["sent", "queued"] } },
    select: { userId: true, messageId: true },
  });

  const result: CampaignDelivery = { handedOff: recipients.length, delivered: 0, bounced: 0, complained: 0, failed: 0, pending: 0, untracked: 0 };
  if (recipients.length === 0) return result;

  // Router record per recipient.
  const routerStatus = new Map<string, string>();
  for (const part of chunks(recipients)) {
    const rows = await prisma.emailMessage.findMany({
      where: { idempotencyKey: { in: part.map((r) => campaignKey(campaignId, r.userId)) } },
      select: { idempotencyKey: true, status: true },
    });
    for (const m of rows) if (m.idempotencyKey) routerStatus.set(m.idempotencyKey, m.status);
  }

  // Older log, for recipients the router has no record of.
  const logIds = recipients.filter((r) => !routerStatus.has(campaignKey(campaignId, r.userId)) && r.messageId).map((r) => r.messageId!);
  const logStatus = new Map<string, string>();
  for (const part of chunks(logIds)) {
    const rows = await prisma.emailLog.findMany({
      where: { providerMessageId: { in: part } },
      select: { providerMessageId: true, status: true },
    });
    for (const l of rows) if (l.providerMessageId) logStatus.set(l.providerMessageId, l.status);
  }

  for (const r of recipients) {
    const status = routerStatus.get(campaignKey(campaignId, r.userId)) ?? (r.messageId ? logStatus.get(r.messageId) : undefined);
    result[deliveryBucket(status)]++;
  }
  return result;
}
