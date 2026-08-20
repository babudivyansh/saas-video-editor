import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { completeMultipartUpload, getS3ObjectSize, deleteS3Object } from "@/utils/s3-upload";
import { getOwnedPendingUpload } from "@/lib/pending-upload";
import {
  adoptExistingS3Object,
  assertFileSizeAllowed,
  assertUnderStorageQuota,
  AssetLimitError,
  assetLimitStatus,
} from "@/lib/asset-service";
import { logger } from "@/lib/logger";

interface CompleteBody {
  key?: string;
  uploadId?: string;
  parts?: Array<{ ETag: string; PartNumber: number }>;
  name?: string;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

// POST /api/upload/multipart/complete — step 3, after every part has
// uploaded. Note: unlike the single-shot /api/upload path, this does NOT
// dedup by checksum (the full bytes never pass through this server for a
// multipart upload) — duplicate detection is scoped to single-shot uploads
// only, a deliberate, documented gap rather than an expensive re-download
// just to hash a large file that's unlikely to be a near-duplicate anyway.
//
// Security fix (Upload Limits Audit §6/P1): the client-declared `size` from
// the multipart/create step is NEVER trusted here for entitlement — after
// CompleteMultipartUploadCommand, a HeadObjectCommand re-reads the real,
// finalized object's ContentLength from S3, and THAT is what's checked
// against the user's plan/storage entitlement before an Asset is ever
// created. A client could otherwise declare a small size while actually
// uploading (and completing) far more bytes across the parts. If the real
// size violates the user's entitlement, the S3 object is deleted, the
// PendingUpload row is cleared, and no Asset is created — a rejected upload
// must never leave an oversized orphan object behind.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CompleteBody;
  const { key, uploadId, parts, name, mimeType } = body;
  if (!key || !uploadId || !parts?.length || !name || !mimeType) {
    return NextResponse.json({ error: "key, uploadId, parts, name, and mimeType are required" }, { status: 400 });
  }

  const pending = await getOwnedPendingUpload(auth.userId, key, uploadId);
  if (!pending) return NextResponse.json({ error: "Upload session not found" }, { status: 404 });

  try {
    await completeMultipartUpload(key, uploadId, parts);
  } catch (e) {
    logger.error("upload-multipart", "CompleteMultipartUpload failed", e);
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 502 });
  }

  // Authoritative size: read straight from the finalized S3 object, not from
  // anything the client sent.
  const actualSize = await getS3ObjectSize(key);

  try {
    const tier = await assertFileSizeAllowed(auth.userId, actualSize);
    await assertUnderStorageQuota(auth.userId, tier, actualSize);
  } catch (e) {
    // Entitlement failure on the REAL object size — clean up rather than
    // leaving an oversized object the user could otherwise accumulate by
    // repeatedly failing finalization (audit #43).
    await deleteS3Object(key).catch(() => {});
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    if (e instanceof AssetLimitError) {
      return NextResponse.json(
        { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes, actualBytes: actualSize },
        { status: assetLimitStatus(e.kind) },
      );
    }
    throw e;
  }

  try {
    const result = await adoptExistingS3Object({
      userId: auth.userId,
      s3Key: key,
      mimeType,
      name,
      size: actualSize,
      sourceFeature: "upload",
      duration: typeof body.duration === "number" ? body.duration : null,
      width: typeof body.width === "number" ? body.width : null,
      height: typeof body.height === "number" ? body.height : null,
    });
    // Only cleared on success — left in place on any failure below so the
    // asset-cleanup cron can find and delete the now-orphaned finalized S3
    // object (matches the single-shot /api/upload orphan-safety contract).
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    return NextResponse.json({ asset: result.asset });
  } catch (e) {
    if (e instanceof AssetLimitError) {
      // Already validated above against the real size, so reaching this
      // branch would mean a race (e.g. quota consumed by a concurrent
      // upload between the two checks) — still handled correctly, and still
      // needs the same orphan cleanup as the primary check above.
      await deleteS3Object(key).catch(() => {});
      await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.json(
        { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes, actualBytes: actualSize },
        { status: assetLimitStatus(e.kind) },
      );
    }
    logger.error("upload-multipart", "Asset row creation failed after successful multipart upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "upload:multipart:complete" });
