import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { completeMultipartUpload, getAssetReadUrl, s3KeyToPublicUrl } from "@/utils/s3-upload";
import { getOwnedPendingUpload } from "@/lib/pending-upload";
import { enqueueAssetModeration } from "@/lib/asset-moderation";
import { auditAssetAction } from "@/lib/asset-audit";
import { logger } from "@/lib/logger";

function getKind(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

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
// compute a checksum (the full bytes never pass through this server for a
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

  const kind = getKind(mimeType);
  const url = s3KeyToPublicUrl(key);

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        userId: auth.userId,
        name: name.slice(0, 200),
        s3Key: key,
        url,
        mimeType,
        kind,
        size,
        duration: typeof body.duration === "number" ? body.duration : undefined,
        width: typeof body.width === "number" ? body.width : undefined,
        height: typeof body.height === "number" ? body.height : undefined,
      },
    });
  } catch (e) {
    logger.error("upload-multipart", "Asset row creation failed after successful multipart upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
  await auditAssetAction(auth.userId, "upload", asset.id, { name: asset.name, size: asset.size, kind, multipart: true });
  enqueueAssetModeration({ assetId: asset.id, userId: auth.userId, s3Key: key, mimeType, kind });

  const readUrl = await getAssetReadUrl(key);
  return NextResponse.json({ asset: { ...asset, url: readUrl } });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "upload:multipart:complete" });
