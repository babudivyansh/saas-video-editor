import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { storageLimitBytesForTier } from "@/lib/plans/tiers";
import {
  uploadBufferToS3,
  getAssetReadUrl,
  sanitizeS3Key,
  extensionForMime,
  deleteS3Object,
} from "@/utils/s3-upload";
import { enqueueAssetModeration } from "@/lib/asset-moderation";
import { auditAssetAction } from "@/lib/asset-audit";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

function getKind(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
// Stored objects are served back with this exact Content-Type and no
// Content-Disposition/CDN layer forces a download, so an unrestricted upload
// (e.g. text/html) would be a stored-XSS vector on the S3 origin.
const ALLOWED_MIME = /^(video|audio|image)\/(mp4|mpeg|quicktime|webm|x-matroska|mp3|wav|ogg|png|jpeg|jpg|webp|gif)$/;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skipAsset = new URL(req.url).searchParams.get("skipAsset") === "true";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
  }

  if (!ALLOWED_MIME.test(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // skipAsset callers (e.g. the account-avatar uploader in AccountNav.tsx)
  // are outside the Assets library entirely — the returned URL gets stored
  // forever as User.avatarUrl, so this path keeps the original permanent,
  // publicly-served URL it already depends on instead of a short-lived
  // signed one. Only Asset-backed uploads (below) adopt the signed-URL model.
  if (skipAsset) {
    const ext = extensionForMime(file.type);
    const key = sanitizeS3Key(`uploads/${auth.userId}/${randomUUID()}.${ext}`);
    const url = await uploadBufferToS3(buffer, key, file.type || "application/octet-stream");
    return NextResponse.json({ url, key });
  }

  const mimeType = file.type || "application/octet-stream";
  const kind = getKind(mimeType);

  // Duplicate detection — SHA-256 of the actual bytes, computed server-side
  // (never trust a client-supplied hash). Returns the existing asset instead
  // of silently storing (and billing storage for) a second copy.
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.asset.findFirst({
    where: { userId: auth.userId, checksum },
  });
  if (existing) {
    const readUrl = await getAssetReadUrl(existing.s3Key);
    // Mirror the success response's top-level `url`/`key`, not just `asset.url`.
    // The video-generate flows (useVideoGenerate.uploadVideo -> AutoClip,
    // split-screen, streamer-video) read `data.url` from this response and pass
    // it straight into createProject as `uploadedVideoUrl`. On a duplicate this
    // used to be undefined, so JSON.stringify dropped it, the project was created
    // with a null source, and analysis died with "Project has no uploaded video"
    // — i.e. re-using any video you'd uploaded before broke AutoClip entirely.
    return NextResponse.json({ duplicate: true, url: readUrl, key: existing.s3Key, asset: { ...existing, url: readUrl } });
  }

  // Server-side cumulative storage quota — replaces the previously cosmetic
  // "2GB" constant shown in the UI with real enforcement.
  const tier = await getUserTier(auth.userId);
  const limitBytes = storageLimitBytesForTier(tier);
  const usage = await prisma.asset.aggregate({
    where: { userId: auth.userId, archivedAt: null },
    _sum: { size: true },
  });
  const usedBytes = usage._sum.size ?? 0;
  if (usedBytes + file.size > limitBytes) {
    return NextResponse.json(
      {
        error: `Storage limit reached (${(limitBytes / 1024 ** 3).toFixed(1)}GB on your plan). Delete files or upgrade to upload more.`,
        usedBytes,
        limitBytes,
      },
      { status: 402 },
    );
  }

  // Extension is derived from the already-validated MIME type, never from
  // the client-supplied filename — a filename with no "." previously made
  // the whole name become the "extension", injecting "/" and ".." into the
  // S3 key. sanitizeS3Key is a second, defense-in-depth pass on the full key.
  const ext = extensionForMime(mimeType);
  const key = sanitizeS3Key(`uploads/${auth.userId}/${randomUUID()}.${ext}`);

  // Written before the S3 PUT so the cleanup cron (app/api/cron/asset-cleanup)
  // can find and delete this object if the Asset row below never gets
  // created (crash, DB outage, right after a successful upload).
  const pending = await prisma.pendingUpload.create({ data: { userId: auth.userId, s3Key: key } });

  let url: string;
  try {
    url = await uploadBufferToS3(buffer, key, mimeType);
  } catch (e) {
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("upload", "S3 upload failed", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const duration = formData.get("duration") ? parseFloat(formData.get("duration") as string) : null;
  const width = formData.get("width") ? parseInt(formData.get("width") as string) : null;
  const height = formData.get("height") ? parseInt(formData.get("height") as string) : null;

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        userId: auth.userId,
        name: file.name.slice(0, 200),
        s3Key: key,
        url,
        mimeType,
        kind,
        size: file.size,
        checksum,
        duration: duration ?? undefined,
        width: width ?? undefined,
        height: height ?? undefined,
      },
    });
  } catch (e) {
    // DB insert failed after a successful S3 PUT — compensating delete so
    // this doesn't join the set of silently orphaned objects the old code
    // had no way to detect or clean up.
    await deleteS3Object(key).catch(() => {});
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("upload", "Asset row creation failed after a successful S3 upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
  await auditAssetAction(auth.userId, "upload", asset.id, { name: asset.name, size: asset.size, kind });
  enqueueAssetModeration({ assetId: asset.id, userId: auth.userId, s3Key: key, mimeType, kind });

  const readUrl = await getAssetReadUrl(key);
  return NextResponse.json({ url: readUrl, key, asset: { ...asset, url: readUrl } });
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "upload:create" });
