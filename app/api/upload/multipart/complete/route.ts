import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { completeMultipartUpload } from "@/utils/s3-upload";
import { getOwnedPendingUpload } from "@/lib/pending-upload";
import { adoptExistingS3Object, AssetLimitError, assetLimitStatus } from "@/lib/asset-service";
import { logger } from "@/lib/logger";

interface CompleteBody {
  key?: string;
  uploadId?: string;
  parts?: Array<{ ETag: string; PartNumber: number }>;
  name?: string;
  mimeType?: string;
  size?: number;
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
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CompleteBody;
  const { key, uploadId, parts, name, mimeType, size } = body;
  if (!key || !uploadId || !parts?.length || !name || !mimeType || typeof size !== "number") {
    return NextResponse.json({ error: "key, uploadId, parts, name, mimeType, and size are required" }, { status: 400 });
  }

  const pending = await getOwnedPendingUpload(auth.userId, key, uploadId);
  if (!pending) return NextResponse.json({ error: "Upload session not found" }, { status: 404 });

  try {
    await completeMultipartUpload(key, uploadId, parts);
  } catch (e) {
    logger.error("upload-multipart", "CompleteMultipartUpload failed", e);
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 502 });
  }

  try {
    const result = await adoptExistingS3Object({
      userId: auth.userId,
      s3Key: key,
      mimeType,
      name,
      size,
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
      return NextResponse.json(
        { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes },
        { status: assetLimitStatus(e.kind) },
      );
    }
    logger.error("upload-multipart", "Asset row creation failed after successful multipart upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "upload:multipart:complete" });
