// "Download my data" — a background job (same createRenderQueue pattern as
// every other queue in this codebase) that bundles a user's own data into a
// single JSON file and uploads it to S3 for a signed-URL download.
//
// Scope, stated plainly: this exports structured DATA (profile fields,
// project/clip/asset METADATA, purchase history, login history) plus signed
// URLs to the user's existing media — it does not re-host copies of every
// video file into the export. Re-bundling potentially many GB of video
// (synchronously or as a job) is a real cost/scale problem standard
// "download your data" features don't attempt either; the signed URLs are
// already a complete, working path to the actual files.
//
// Deliberately NOT wrapped in a zip: a single JSON file has nothing for
// lib/zip-writer.ts's store-only format to usefully bundle or compress —
// unlike the Assets bulk-download job, there's no multi-file archive to build.

import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createRenderQueue } from "@/lib/render-queue";
import { uploadFileToS3, getAssetReadUrl } from "@/utils/s3-upload";
import { sendAccountExportReadyEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const EXPORT_URL_TTL_SEC = 24 * 3600;
const LOGIN_HISTORY_LIMIT = 100;

export interface AccountExportPayload {
  // createRenderQueue<T extends { projectId: string }> progress-tracking key
  // — this queue tracks by the export job's own id, not a real Project.
  projectId: string;
  jobId: string;
  userId: string;
}

function statusKey(jobId: string) {
  return `accountexport:${jobId}`;
}

export async function accountExportJob(payload: AccountExportPayload): Promise<void> {
  const { jobId, userId } = payload;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User ${userId} not found`);

    const [projects, assets, purchases, loginEvents, notificationPreference] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        include: { clips: { select: { id: true, title: true, startSec: true, endSec: true, status: true, videoUrl: true, createdAt: true } } },
      }),
      prisma.asset.findMany({ where: { userId }, select: { id: true, name: true, kind: true, size: true, s3Key: true, createdAt: true } }),
      prisma.purchase.findMany({ where: { userId } }),
      prisma.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: LOGIN_HISTORY_LIMIT }),
      prisma.notificationPreference.findUnique({ where: { userId } }),
    ]);

    const assetsWithUrls = await Promise.all(
      assets.map(async (a) => ({ ...a, url: await getAssetReadUrl(a.s3Key).catch(() => null) })),
    );

    const bundle = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id, email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName,
        name: user.name, gender: user.gender, intendedUse: user.intendedUse, createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt, credits: user.credits,
      },
      projects: projects.map(({ ...p }) => p),
      assets: assetsWithUrls.map(({ s3Key, ...a }) => { void s3Key; return a; }), // internal key excluded, url is the useful field
      purchases,
      loginHistory: loginEvents,
      notificationPreferences: notificationPreference,
    };

    const tmpDir = path.join(os.tmpdir(), `account-export-${jobId}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "account-data.json");
    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2));

    const key = `exports/${userId}/${jobId}.json`;
    await uploadFileToS3(filePath, key, "application/json");
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const url = await getAssetReadUrl(key, EXPORT_URL_TTL_SEC);
    await redis.set(statusKey(jobId), JSON.stringify({ status: "ready", url }), "EX", EXPORT_URL_TTL_SEC);

    sendAccountExportReadyEmail(user.email, user.firstName ?? user.name ?? "", url)
      .catch((e) => logger.error("account-export", "ready email failed", e));
  } catch (e) {
    logger.error("account-export", `export job ${jobId} failed`, e);
    await redis.set(statusKey(jobId), JSON.stringify({ status: "failed", error: "Failed to build your data export." }), "EX", EXPORT_URL_TTL_SEC).catch(() => {});
    throw e;
  }
}

export interface AccountExportStatus {
  status: "queued" | "ready" | "failed";
  url?: string;
  error?: string;
}

export async function getAccountExportStatus(jobId: string): Promise<AccountExportStatus> {
  const raw = await redis.get(statusKey(jobId));
  if (!raw) return { status: "queued" };
  return JSON.parse(raw) as AccountExportStatus;
}

const accountExportQueue = createRenderQueue<AccountExportPayload>("account-export", accountExportJob);

export function enqueueAccountExport(userId: string): string {
  const jobId = randomUUID();
  accountExportQueue.enqueue(jobId, { projectId: jobId, jobId, userId });
  return jobId;
}
