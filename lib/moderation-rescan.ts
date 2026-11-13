// Re-runs content moderation on uploads whose scan never happened.
//
// Every scan failed in production until Rekognition's DetectModerationLabels
// was added to the app's IAM policy (2026-11-13): the jobs fell back to
// "skipped", so no user upload had ever been checked. This sends those back
// through the normal moderation jobs once the permission exists. Run from
// Admin → Ops (app/api/admin/ops/rescan-moderation); a dry run by default.
//
// Not touched: audio (no picture to scan) and media the app made itself
// (AutoClip renders, stock re-hosts), which skip moderation by design.

import { prisma } from "@/lib/prisma";
import { enqueueAssetModeration } from "@/lib/asset-moderation";
import { enqueueReviewAttachmentModeration } from "@/lib/reviews/attachment-moderation";

/** Sources whose media the app produced itself; never user content. */
export const SELF_PRODUCED_SOURCES = ["autoclip", "stock"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface RescanResult {
  dryRun: boolean;
  /** Skipped user uploads found (up to `limit` of each kind of row). */
  assets: number;
  attachments: number;
  /** Rows actually sent back to the scan queue (0 on a dry run). */
  queued: number;
}

const VISUAL = ["image", "video"] as const;
type Visual = (typeof VISUAL)[number];
const isVisual = (k: string): k is Visual => (VISUAL as readonly string[]).includes(k);

export async function rescanSkippedUploads(opts: { dryRun?: boolean; limit?: number } = {}): Promise<RescanResult> {
  const dryRun = opts.dryRun !== false;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(opts.limit ?? DEFAULT_LIMIT)));

  const assets = await prisma.asset.findMany({
    where: {
      moderationStatus: "skipped",
      kind: { in: [...VISUAL] },
      archivedAt: null,
      sourceFeature: { notIn: SELF_PRODUCED_SOURCES },
    },
    select: { id: true, userId: true, s3Key: true, mimeType: true, kind: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const attachments = await prisma.reviewAttachment.findMany({
    where: { moderationStatus: "skipped", kind: { in: [...VISUAL] } },
    select: { id: true, reviewId: true, userId: true, s3Key: true, mimeType: true, kind: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let queued = 0;
  if (!dryRun) {
    for (const a of assets) {
      if (!isVisual(a.kind)) continue;
      // The status move is the claim: a second click, or a scan that finished
      // in between, leaves the row alone instead of queueing it twice.
      const moved = await prisma.asset.updateMany({ where: { id: a.id, moderationStatus: "skipped" }, data: { moderationStatus: "pending" } });
      if (moved.count === 0) continue;
      enqueueAssetModeration({ assetId: a.id, userId: a.userId, s3Key: a.s3Key, mimeType: a.mimeType, kind: a.kind });
      queued++;
    }
    for (const r of attachments) {
      if (!isVisual(r.kind)) continue;
      const moved = await prisma.reviewAttachment.updateMany({ where: { id: r.id, moderationStatus: "skipped" }, data: { moderationStatus: "pending" } });
      if (moved.count === 0) continue;
      enqueueReviewAttachmentModeration({
        attachmentId: r.id, reviewId: r.reviewId, userId: r.userId, s3Key: r.s3Key, mimeType: r.mimeType, kind: r.kind,
      });
      queued++;
    }
  }

  return { dryRun, assets: assets.length, attachments: attachments.length, queued };
}
