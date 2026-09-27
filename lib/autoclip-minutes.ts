// What an AutoClip run costs, in Clip Minutes — and the one place that charges
// and refunds it (2026-09-26 pricing plan, Stage 3).
//
// A run bills 1 minute per minute of uploaded source, rounded up per video,
// however many clips it produces. The charge is taken in pickJob right after
// the duration probe and BEFORE transcription or face tracking, i.e. before
// any provider money is spent — the exact spot the old analysis credit charge
// sat. At that point the duration is exact, so there is no worst-case hold and
// no settle-down refund to get wrong.
//
// Ledger refIds:
//   auto-clip:<projectId>           minutes, in MinuteTransaction. Same string
//                                    as the legacy credit hold, but a separate
//                                    table — the two can never net against each
//                                    other.
//   auto-clip-overflow:<projectId>  credits paid for a minutes shortfall.
//
// Every refund below is ledger-driven (restoreMinutes / restoreSpend with no
// amount), so it returns exactly what is still held and is safe to call twice.

import { prisma } from "@/lib/prisma";
import { spendMinutes, restoreMinutes, billableSourceMinutes, getMinuteBalances } from "@/lib/minutes";
import { spendCredits, restoreSpend, logToolGeneration } from "@/lib/credits";
import { AUTOCLIP_RERUN_FREE_WINDOW_DAYS, overflowCreditsFor } from "@/lib/plans/tiers";
import { logger } from "@/lib/logger";

export const runMinutesRefId = (projectId: string) => `auto-clip:${projectId}`;
export const overflowRefId = (projectId: string) => `auto-clip-overflow:${projectId}`;

/**
 * The identity of a source for the re-run window: its URL without the query
 * string. A project's uploadedVideoUrl is often PRESIGNED (a fresh signature
 * per request), so the same S3 object shows up as a different string each
 * time — comparing whole URLs made a genuine re-run look like a new source.
 */
export function sourceIdentity(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function netMinutesHeld(userId: string, refId: string): Promise<number> {
  const rows = await prisma.minuteTransaction.findMany({ where: { userId, refId }, select: { delta: true } });
  return Math.max(0, -rows.reduce((s, r) => s + r.delta, 0));
}

async function netCreditsHeld(userId: string, refId: string): Promise<number> {
  const rows = await prisma.creditTransaction.findMany({ where: { userId, refId }, select: { delta: true } });
  return Math.max(0, -rows.reduce((s, r) => s + r.delta, 0));
}

/**
 * A project of this user's, on the same source, that was PAID for within the
 * free re-run window — or null. "Paid" means minutes or overflow credits are
 * still held for it: a run that failed was refunded, and re-running a refunded
 * source is a first run, not a re-run.
 */
export async function findPaidRunOfSameSource(
  userId: string,
  uploadedVideoUrl: string,
  excludeProjectId: string,
): Promise<string | null> {
  const since = new Date(Date.now() - AUTOCLIP_RERUN_FREE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.project.findMany({
    where: {
      userId,
      // Exactly the object, bare or with any query — never a longer path that
      // merely starts the same ("…/a.mp4" must not match "…/a.mp4.bak").
      OR: [
        { uploadedVideoUrl: sourceIdentity(uploadedVideoUrl) },
        { uploadedVideoUrl: { startsWith: `${sourceIdentity(uploadedVideoUrl)}?` } },
      ],
      id: { not: excludeProjectId },
      updatedAt: { gte: since },
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  for (const c of candidates) {
    if ((await netMinutesHeld(userId, runMinutesRefId(c.id))) > 0) return c.id;
    if ((await netCreditsHeld(userId, overflowRefId(c.id))) > 0) return c.id;
  }
  return null;
}

export type RunCharge =
  | { ok: true; minutes: number; overflowCredits: number; freeRerunOf?: string; alreadyCharged?: boolean }
  | { ok: false; needed: number; available: number; overflowCredits: number };

/**
 * Charge a run for its source length. Idempotent per project: a retried pick
 * attempt (the queue retries non-final failures without refunding) finds the
 * charge already held and does not take it again.
 */
export async function chargeRunMinutes(params: {
  userId: string;
  projectId: string;
  uploadedVideoUrl: string;
  durationSec: number;
  /** The user opted in to paying a minutes shortfall in AI credits. */
  allowCreditOverflow?: boolean;
}): Promise<RunCharge> {
  const { userId, projectId, uploadedVideoUrl, durationSec } = params;
  const refId = runMinutesRefId(projectId);
  const needed = billableSourceMinutes(durationSec);

  const [heldMinutes, heldOverflow] = await Promise.all([
    netMinutesHeld(userId, refId),
    netCreditsHeld(userId, overflowRefId(projectId)),
  ]);
  if (heldMinutes > 0 || heldOverflow > 0) {
    return { ok: true, minutes: heldMinutes, overflowCredits: heldOverflow, alreadyCharged: true };
  }

  const rerunOf = await findPaidRunOfSameSource(userId, uploadedVideoUrl, projectId);
  if (rerunOf) return { ok: true, minutes: 0, overflowCredits: 0, freeRerunOf: rerunOf };

  const spend = await spendMinutes({ userId, amount: needed, reason: "spend:auto-clip", refId });
  if (spend.ok) return { ok: true, minutes: needed, overflowCredits: 0 };

  const available = spend.balances.total;
  const overflowCredits = overflowCreditsFor(needed - available);
  if (!params.allowCreditOverflow) return { ok: false, needed, available, overflowCredits };

  // Overflow: use every minute the user has, pay the rest in credits. Two
  // meters can't share one transaction here, so the minutes go first and are
  // handed back if the credit half fails.
  if (available > 0) {
    const part = await spendMinutes({ userId, amount: available, reason: "spend:auto-clip", refId });
    // The balance moved between the two calls (a concurrent run). Report the
    // shortfall rather than guess at a new split.
    if (!part.ok) return { ok: false, needed, available: part.balances.total, overflowCredits };
  }
  const credit = await spendCredits({
    userId, amount: overflowCredits, reason: "spend:auto-clip-overflow", refId: overflowRefId(projectId),
  });
  if (!credit.ok) {
    if (available > 0) {
      await restoreMinutes({ userId, refId, reason: "refund:auto-clip-overflow-failed" }).catch((e) =>
        logger.error("auto-clip", `could not return minutes after a failed overflow for ${projectId}`, e));
    }
    return { ok: false, needed, available, overflowCredits };
  }
  void logToolGeneration({
    userId, toolSlug: "auto-clip", creditsCost: overflowCredits, generationType: "video", refId: overflowRefId(projectId),
  });
  return { ok: true, minutes: available, overflowCredits };
}

/** Return everything a run still holds in minutes and overflow credits. */
export async function refundRunMinutes(userId: string, projectId: string, reason: string): Promise<{ minutes: number; credits: number }> {
  const [minutes, credits] = await Promise.all([
    restoreMinutes({ userId, refId: runMinutesRefId(projectId), reason }).catch((e) => {
      logger.error("auto-clip", `minute refund failed for ${projectId}`, e);
      return 0;
    }),
    restoreSpend({ userId, refId: overflowRefId(projectId), reason }).catch((e) => {
      logger.error("auto-clip", `overflow credit refund failed for ${projectId}`, e);
      return 0;
    }),
  ]);
  return { minutes, credits };
}

/**
 * Start-time pre-check, used only when the source duration is already known
 * (an uploaded or library asset). Charges nothing — pickJob does that — but
 * lets the create route refuse a run the user can't pay for BEFORE the project
 * is claimed and queued. Free re-runs always pass.
 */
export async function precheckRunMinutes(params: {
  userId: string;
  projectId: string;
  uploadedVideoUrl: string;
  durationSec: number;
  allowCreditOverflow?: boolean;
}): Promise<{ ok: true } | { ok: false; needed: number; available: number; overflowCredits: number }> {
  const needed = billableSourceMinutes(params.durationSec);
  const { total } = await getMinuteBalances(params.userId);
  if (total >= needed) return { ok: true };
  if (await findPaidRunOfSameSource(params.userId, params.uploadedVideoUrl, params.projectId)) return { ok: true };
  const overflowCredits = overflowCreditsFor(needed - total);
  if (params.allowCreditOverflow) {
    const { getBalances } = await import("@/lib/credits");
    if ((await getBalances(params.userId)).total >= overflowCredits) return { ok: true };
  }
  return { ok: false, needed, available: total, overflowCredits };
}
