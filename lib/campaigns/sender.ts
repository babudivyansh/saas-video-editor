// The campaign send loop, run by app/api/cron/email-campaigns every 2 minutes.
//
//  1. Start due campaigns: scheduled → sending (claimed with a conditional
//     update, so two overlapping runs can't both start one), and fix the
//     recipient list at that moment (lib/campaigns/audience.ts).
//  2. Spend this run's budget (lib/campaigns/budget.ts) on pending recipients,
//     oldest campaign first. Each recipient is claimed pending → sending before
//     its email goes out, and sendTemplate gets an idempotency key, so a
//     retried or overlapping run never mails anyone twice.
//  3. A campaign with nobody left pending is marked sent.
//
// Opt-outs and suppressions are re-checked by sendTemplate at send time, so
// someone who unsubscribes mid-campaign is skipped rather than mailed.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendTemplate, type SendResult } from "@/lib/email/send";
import { greetingName } from "@/lib/display-name";
import { campaignBlocksSchema } from "./content";
import { readAudience, snapshotRecipients } from "./audience";
import { campaignBudget } from "./budget";

/** A recipient stuck in "sending" this long had its run die mid-send. */
const STALE_SENDING_MS = 30 * 60_000;
/** Stop starting new sends after this long, so a run ends inside the cron's timeout. */
const RUN_TIME_LIMIT_MS = 45_000;

export type RecipientOutcome = "sent" | "queued" | "skipped" | "failed";

/** How a send result is recorded on the recipient row. */
export function outcomeFor(r: SendResult): { status: RecipientOutcome; detail: string | null; spendsQuota: boolean } {
  switch (r.status) {
    case "sent":
    case "duplicate":
      return { status: "sent", detail: null, spendsQuota: r.status === "sent" };
    case "dev-logged":
      // No provider configured (local dev). Recorded as sent so a dev run completes.
      return { status: "sent", detail: "dev-logged", spendsQuota: false };
    case "deferred":
    case "unknown":
      // The router has it and will retry (email-maintenance cron).
      return { status: "queued", detail: r.status, spendsQuota: true };
    case "suppressed":
      return { status: "skipped", detail: "suppressed", spendsQuota: false };
    case "skipped-optout":
      return { status: "skipped", detail: "opted out", spendsQuota: false };
    case "failed":
      return { status: "failed", detail: (r.error ?? "send failed").slice(0, 300), spendsQuota: false };
  }
}

export interface CampaignRunResult {
  started: string[];
  sent: number;
  skipped: number;
  failed: number;
  completed: string[];
  blockedBy: string | null;
}

async function startDueCampaigns(now: Date): Promise<string[]> {
  const due = await prisma.emailCampaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, audience: true },
  });
  const started: string[] = [];
  for (const c of due) {
    const claim = await prisma.emailCampaign.updateMany({
      where: { id: c.id, status: "scheduled" },
      data: { status: "sending", startedAt: now },
    });
    if (claim.count === 0) continue;
    try {
      const count = await snapshotRecipients(c.id, readAudience(c.audience), now);
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { audienceCount: count } });
      started.push(c.id);
    } catch (e) {
      // Put it back so the next run retries the snapshot rather than sending to a partial list.
      logger.error("campaigns", `recipient snapshot failed for ${c.id}`, e);
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: "scheduled", startedAt: null } });
    }
  }
  return started;
}

export async function runCampaigns(now: Date = new Date()): Promise<CampaignRunResult> {
  const t0 = Date.now();
  const result: CampaignRunResult = { started: [], sent: 0, skipped: 0, failed: 0, completed: [], blockedBy: null };

  result.started = await startDueCampaigns(now);

  // Recover rows a crashed run left mid-send. Safe: the idempotency key stops
  // the router re-sending anything that did go out.
  await prisma.emailCampaignRecipient.updateMany({
    where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    data: { status: "pending", claimedAt: null },
  });

  const sending = await prisma.emailCampaign.findMany({
    where: { status: "sending" },
    orderBy: { startedAt: "asc" },
  });
  if (sending.length === 0) return result;

  const budget = await campaignBudget(now);
  let left = budget.allowed;
  result.blockedBy = budget.blockedBy;

  for (const c of sending) {
    const blocks = campaignBlocksSchema.safeParse(c.blocks);
    if (!blocks.success) {
      logger.error("campaigns", `campaign ${c.id} has invalid content; pausing it`);
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: "paused" } });
      continue;
    }

    while (left > 0 && Date.now() - t0 < RUN_TIME_LIMIT_MS) {
      const batch = await prisma.emailCampaignRecipient.findMany({
        where: { campaignId: c.id, status: "pending" },
        orderBy: { createdAt: "asc" },
        take: Math.min(left, 20),
        select: { id: true, userId: true, user: { select: { email: true, name: true, purgedAt: true, suspendedAt: true, deactivatedAt: true } } },
      });
      if (batch.length === 0) break;

      for (const r of batch) {
        if (left <= 0 || Date.now() - t0 >= RUN_TIME_LIMIT_MS) break;
        const claim = await prisma.emailCampaignRecipient.updateMany({
          where: { id: r.id, status: "pending" },
          data: { status: "sending", claimedAt: new Date() },
        });
        if (claim.count === 0) continue;

        let status: RecipientOutcome;
        let detail: string | null;
        let messageId: string | null = null;
        if (r.user.purgedAt || r.user.suspendedAt || r.user.deactivatedAt) {
          status = "skipped";
          detail = "account no longer active";
        } else {
          const res = await sendTemplate(
            "campaign",
            r.user.email,
            {
              name: greetingName(r.user.name),
              subject: c.subject,
              preheader: c.preheader,
              blocks: blocks.data,
              utmCampaign: c.utmCampaign,
            },
            { userId: r.userId, idempotencyKey: `campaign:${c.id}:${r.userId}` },
          );
          const o = outcomeFor(res);
          status = o.status;
          detail = o.detail;
          messageId = res.messageId;
          if (o.spendsQuota) left--;
        }

        await prisma.emailCampaignRecipient.update({
          where: { id: r.id },
          data: { status, detail, messageId, sentAt: status === "sent" || status === "queued" ? new Date() : null },
        });
        const counter = status === "skipped" ? "skippedCount" : status === "failed" ? "failedCount" : "sentCount";
        await prisma.emailCampaign.update({ where: { id: c.id }, data: { [counter]: { increment: 1 } } });
        if (status === "skipped") result.skipped++;
        else if (status === "failed") result.failed++;
        else result.sent++;
      }
    }

    const remaining = await prisma.emailCampaignRecipient.count({
      where: { campaignId: c.id, status: { in: ["pending", "sending"] } },
    });
    if (remaining === 0) {
      const done = await prisma.emailCampaign.updateMany({
        where: { id: c.id, status: "sending" },
        data: { status: "sent", completedAt: new Date() },
      });
      if (done.count) result.completed.push(c.id);
    }
    if (left <= 0 || Date.now() - t0 >= RUN_TIME_LIMIT_MS) break;
  }

  return result;
}
