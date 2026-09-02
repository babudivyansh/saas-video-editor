// Bulk "download selected assets" as a background job instead of a
// synchronous request — zipping several large video files inline would
// blow past a serverless function's response-time budget and buffer
// multiple full files in the request handler's memory at once. Uses the
// same BullMQ render-queue infrastructure as everything else (lib/render-queue.ts).

import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createRenderQueue } from "@/lib/render-queue";
import { downloadS3ObjectToFile, uploadFileToS3, getAssetReadUrl } from "@/utils/s3-upload";
import { ZipWriter } from "@/lib/zip-writer";
import { logger } from "@/lib/logger";

const ZIP_URL_TTL_SEC = 24 * 3600;
const MAX_ZIP_ASSETS = 200;
const MAX_ZIP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — keeps the worker's memory bounded

export interface AssetZipPayload {
  // createRenderQueue<T extends { projectId: string }> progress-tracking key
  // — this queue tracks by the zip job's own id, not a real Project.
  projectId: string;
  jobId: string;
  userId: string;
  assetIds: string[];
}

function statusKey(jobId: string) {
  return `assetzip:${jobId}`;
}

export async function assetZipJob(payload: AssetZipPayload): Promise<void> {
  const { jobId, userId, assetIds } = payload;
  const tmpDir = path.join(os.tmpdir(), `assetzip-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const assets = await prisma.asset.findMany({
      // Moderation-flagged assets are hidden behind an "Under review" tile in
      // the library, but nothing stopped them being bundled into a zip — the
      // filter was id + owner only, so a bulk download handed back exactly the
      // content that had been withheld.
      where: {
        id: { in: assetIds.slice(0, MAX_ZIP_ASSETS) },
        userId,
        moderationStatus: { not: "flagged" },
      },
      select: { id: true, name: true, s3Key: true, size: true },
    });

    const totalBytes = assets.reduce((s, a) => s + a.size, 0);
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
      await redis.set(statusKey(jobId), JSON.stringify({
        status: "failed",
        error: `Selection too large to zip (${(totalBytes / 1024 ** 3).toFixed(1)}GB, max ${MAX_ZIP_TOTAL_BYTES / 1024 ** 3}GB) — download fewer files at once.`,
        userId,
      }), "EX", ZIP_URL_TTL_SEC);
      return;
    }

    const zip = new ZipWriter();
    const usedNames = new Set<string>();
    for (const asset of assets) {
      const localPath = path.join(tmpDir, `${asset.id}${path.extname(asset.name) || ""}`);
      await downloadS3ObjectToFile(asset.s3Key, localPath);
      const buf = fs.readFileSync(localPath);

      let entryName = asset.name || asset.id;
      if (usedNames.has(entryName)) {
        const ext = path.extname(entryName);
        entryName = `${path.basename(entryName, ext)}-${asset.id.slice(0, 6)}${ext}`;
      }
      usedNames.add(entryName);

      zip.addFile(entryName, buf);
      fs.unlinkSync(localPath);
    }

    const zipBuffer = zip.toBuffer();
    const zipKey = `zips/${userId}/${jobId}.zip`;
    const zipPath = path.join(tmpDir, "out.zip");
    fs.writeFileSync(zipPath, zipBuffer);
    await uploadFileToS3(zipPath, zipKey, "application/zip");

    const url = await getAssetReadUrl(zipKey, ZIP_URL_TTL_SEC);
    await redis.set(statusKey(jobId), JSON.stringify({ status: "ready", url, count: assets.length, userId }), "EX", ZIP_URL_TTL_SEC);
  } catch (e) {
    logger.error("asset-zip", `zip job ${jobId} failed`, e);
    await redis.set(statusKey(jobId), JSON.stringify({ status: "failed", error: "Failed to build the download archive.", userId }), "EX", ZIP_URL_TTL_SEC).catch(() => {});
    throw e;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export interface AssetZipStatus {
  status: "queued" | "ready" | "failed";
  url?: string;
  count?: number;
  error?: string;
  /** Set on "ready"/"failed" records so the status route can enforce that
   * only the user who enqueued this zip can read it — the jobId being an
   * unguessable UUID is not, on its own, an authorization check. */
  userId?: string;
}

export async function getAssetZipStatus(jobId: string): Promise<AssetZipStatus> {
  const raw = await redis.get(statusKey(jobId));
  if (!raw) return { status: "queued" };
  return JSON.parse(raw) as AssetZipStatus;
}

const assetZipQueue = createRenderQueue<AssetZipPayload>("asset-zip", assetZipJob);

export function enqueueAssetZip(userId: string, assetIds: string[]): string {
  const jobId = randomUUID();
  assetZipQueue.enqueue(jobId, { projectId: jobId, jobId, userId, assetIds });
  return jobId;
}
