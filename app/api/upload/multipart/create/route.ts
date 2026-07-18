import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { storageLimitBytesForTier } from "@/lib/plans/tiers";
import { createMultipartUpload, sanitizeS3Key, extensionForMime } from "@/utils/s3-upload";

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED_MIME = /^(video|audio|image)\/(mp4|mpeg|quicktime|webm|x-matroska|mp3|wav|ogg|png|jpeg|jpg|webp|gif)$/;

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
  if (size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
  if (!ALLOWED_MIME.test(mimeType)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

  const tier = await getUserTier(auth.userId);
  const limitBytes = storageLimitBytesForTier(tier);
  const usage = await prisma.asset.aggregate({ where: { userId: auth.userId, archivedAt: null }, _sum: { size: true } });
  const usedBytes = usage._sum.size ?? 0;
  if (usedBytes + size > limitBytes) {
    return NextResponse.json(
      { error: `Storage limit reached (${(limitBytes / 1024 ** 3).toFixed(1)}GB on your plan). Delete files or upgrade to upload more.`, usedBytes, limitBytes },
      { status: 402 },
    );
  }

  const ext = extensionForMime(mimeType);
  const key = sanitizeS3Key(`uploads/${auth.userId}/${randomUUID()}.${ext}`);
  const uploadId = await createMultipartUpload(key, mimeType);

  await prisma.pendingUpload.create({ data: { userId: auth.userId, s3Key: key, multipartUploadId: uploadId } });

  return NextResponse.json({ key, uploadId });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "upload:multipart:create" });
