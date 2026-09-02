// Async content moderation for uploaded assets, queued off the upload
// request path so a scan never adds latency to POST /api/upload. Runs on the
// existing BullMQ render-queue infrastructure (lib/render-queue.ts) instead
// of a bespoke queue.
//
// Real, working today: AWS Rekognition DetectModerationLabels (NSFW/violence
// labels) on images, and on a video's first extracted frame — both already
// depend only on @aws-sdk/client-rekognition, already a project dependency
// (lib/reframe.ts). Audio has no meaningful visual signal, so it's marked
// "skipped" rather than faked.
//
// Malware/virus byte-scanning is a genuine extension point, not a fake pass:
// scanForMalware() honestly returns "not_configured" until a vendor (ClamAV
// layer or a SaaS API) is wired in — it is never reported as "clean".

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { Prisma } from "@prisma/client";
import { rekognition } from "@/lib/reframe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createRenderQueue } from "@/lib/render-queue";
import { generateVideoThumbnail, generateImageThumbnail } from "@/lib/asset-thumbnail";
import { auditAssetAction } from "@/lib/asset-audit";
import { extensionForMime } from "@/utils/s3-upload";

const FLAG_CONFIDENCE_THRESHOLD = 80;

export interface AssetModerationPayload {
  // Satisfies createRenderQueue<T extends { projectId: string }>'s progress-
  // tracking key requirement — this queue tracks by assetId, so projectId is
  // always set to assetId here, not a real Project id.
  projectId: string;
  assetId: string;
  userId: string;
  s3Key: string;
  mimeType: string;
  kind: "video" | "audio" | "image";
}

interface ModerationLabel { name: string; confidence: number }

async function detectModerationLabelsForKey(key: string): Promise<ModerationLabel[]> {
  const res = await rekognition.send(new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: env.AWS_S3_BUCKET, Name: key } },
    MinConfidence: 60,
  }));
  return (res.ModerationLabels ?? [])
    .filter((l) => l.Name && typeof l.Confidence === "number")
    .map((l) => ({ name: l.Name!, confidence: l.Confidence! }));
}

// Honest extension point — no vendor wired up. Returns a status, never a
// fabricated "clean" result. `key` is kept in the signature (unused today)
// because any real scanner implementation will need it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function scanForMalware(key: string): Promise<"not_configured"> {
  return "not_configured";
}

export async function assetModerationJob(payload: AssetModerationPayload): Promise<void> {
  const { assetId, userId, s3Key, mimeType, kind } = payload;
  const malwareScan = await scanForMalware(s3Key);

  if (kind === "audio") {
    await prisma.asset.update({
      where: { id: assetId },
      data: { moderationStatus: "skipped", moderationLabels: { malwareScan } },
    });
    return;
  }

  try {
    let scanKey = s3Key;
    let thumbnailS3Key: string | null = null;
    // Real pixel dimensions, measured server-side. These were client-probed
    // only, so anything that didn't volunteer them left the columns null
    // permanently — and images were never probed at all.
    let dimensions: { width: number | null; height: number | null } | null = null;

    if (kind === "image") {
      const result = await generateImageThumbnail(userId, assetId, s3Key);
      thumbnailS3Key = result.thumbnailS3Key;
      if (result.width && result.height) dimensions = { width: result.width, height: result.height };
      // The original is still what gets scanned — a downscaled JPEG can lose
      // exactly the detail moderation is looking for.
    }

    if (kind === "video") {
      thumbnailS3Key = await generateVideoThumbnail(userId, assetId, s3Key, extensionForMime(mimeType));
      if (!thumbnailS3Key) {
        // Couldn't extract a frame to scan — don't block the asset on it,
        // but don't silently call it "clean" either.
        await prisma.asset.update({ where: { id: assetId }, data: { moderationStatus: "skipped", moderationLabels: { malwareScan } } });
        return;
      }
      scanKey = thumbnailS3Key;
    }

    const labels = await detectModerationLabelsForKey(scanKey);
    const maxConfidence = labels.reduce((m, l) => Math.max(m, l.confidence), 0);
    const flagged = maxConfidence >= FLAG_CONFIDENCE_THRESHOLD;

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        moderationStatus: flagged ? "flagged" : "clean",
        moderationLabels: { labels, malwareScan } as unknown as Prisma.InputJsonValue,
        ...(thumbnailS3Key ? { thumbnailS3Key } : {}),
        ...(dimensions ?? {}),
      },
    });

    if (flagged) {
      await auditAssetAction(userId, "moderation_flagged", assetId, { labels });
    }
  } catch (e) {
    // Never let a moderation failure (missing Rekognition permission, region
    // mismatch, transient AWS error) block the user from seeing their own
    // upload — fall back to "skipped", logged for operator follow-up.
    logger.warn("asset-moderation", `moderation scan failed for asset ${assetId}`, { reason: (e as Error).message });
    await prisma.asset.update({
      where: { id: assetId },
      data: { moderationStatus: "skipped", moderationLabels: { malwareScan } },
    }).catch(() => { /* best-effort */ });
  }
}

export const assetModerationQueue = createRenderQueue<AssetModerationPayload>("asset-moderation", assetModerationJob);

export function enqueueAssetModeration(payload: Omit<AssetModerationPayload, "projectId">): void {
  assetModerationQueue.enqueue(payload.assetId, { ...payload, projectId: payload.assetId });
}
