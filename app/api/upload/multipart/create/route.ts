import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { ALLOWED_UPLOAD_MIME } from "@/lib/plans/tiers";
import { createMultipartUpload, sanitizeS3Key, extensionForMime } from "@/utils/s3-upload";
import { assertUploadAllowed, AssetLimitError, assetLimitStatus } from "@/lib/asset-service";

// POST /api/upload/multipart/create { name, mimeType, size }
// Step 1 of the large-file (>25MB, see useUploadQueue.ts) upload path — a
// single PutObjectCommand can't be paused/resumed, S3 multipart can.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; mimeType?: string; size?: number };
  const { name, mimeType, size } = body;
  if (!name || !mimeType || typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "name, mimeType, and size are required" }, { status: 400 });
  }
  if (!ALLOWED_UPLOAD_MIME.test(mimeType)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

  try {
    await assertUploadAllowed(auth.userId, size);
  } catch (e) {
    if (e instanceof AssetLimitError) {
      return NextResponse.json(
        { error: e.message, limitBytes: e.limitBytes, usedBytes: e.usedBytes },
        { status: assetLimitStatus(e.kind) },
      );
    }
    throw e;
  }

  const ext = extensionForMime(mimeType);
  const key = sanitizeS3Key(`uploads/${auth.userId}/${randomUUID()}.${ext}`);
  const uploadId = await createMultipartUpload(key, mimeType);

  await prisma.pendingUpload.create({ data: { userId: auth.userId, s3Key: key, multipartUploadId: uploadId } });

  return NextResponse.json({ key, uploadId });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "upload:multipart:create" });
