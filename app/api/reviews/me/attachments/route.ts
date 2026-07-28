import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { uploadBufferToS3, sanitizeS3Key, extensionForMime, deleteS3Object } from "@/utils/s3-upload";
import { enqueueReviewAttachmentModeration } from "@/lib/reviews/attachment-moderation";
import { logger } from "@/lib/logger";

const MAX_ATTACHMENTS_PER_REVIEW = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
// Narrower than the general uploader's allow-list — these are illustrative
// screenshots/clips attached to a review, not source footage.
const ALLOWED_MIME = /^(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|quicktime))$/;

function getKind(mimeType: string): "image" | "video" {
  return mimeType.startsWith("video/") ? "video" : "image";
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const review = await prisma.review.findUnique({ where: { userId: auth.userId } });
  if (!review) return NextResponse.json({ error: "Submit a review before adding attachments." }, { status: 404 });

  const count = await prisma.reviewAttachment.count({ where: { reviewId: review.id } });
  if (count >= MAX_ATTACHMENTS_PER_REVIEW) {
    return NextResponse.json({ error: `A review can have at most ${MAX_ATTACHMENTS_PER_REVIEW} attachments.` }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.test(mimeType)) {
    return NextResponse.json({ error: "Unsupported file type — images or short video only" }, { status: 415 });
  }

  const kind = getKind(mimeType);
  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extensionForMime(mimeType);
  const key = sanitizeS3Key(`review-attachments/${auth.userId}/${randomUUID()}.${ext}`);

  // Written before the S3 PUT so the cleanup cron (app/api/cron/asset-cleanup)
  // can find and delete this object if the ReviewAttachment row below never
  // gets created (crash, DB outage, right after a successful upload).
  const pending = await prisma.pendingUpload.create({ data: { userId: auth.userId, s3Key: key } });

  let url: string;
  try {
    url = await uploadBufferToS3(buffer, key, mimeType);
  } catch (e) {
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("reviews", "S3 upload failed for review attachment", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  let attachment;
  try {
    attachment = await prisma.reviewAttachment.create({
      data: { reviewId: review.id, userId: auth.userId, s3Key: key, mimeType, kind, size: file.size },
    });
  } catch (e) {
    await deleteS3Object(key).catch(() => {});
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("reviews", "ReviewAttachment row creation failed after a successful S3 upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});

  // A new attachment changes the review's public-facing content — a live
  // review must be re-checked before showing it, same re-moderation policy
  // as a text edit.
  if (review.status === "published") {
    await prisma.review.update({ where: { id: review.id }, data: { status: "pending", editedAt: new Date() } });
  }

  enqueueReviewAttachmentModeration({ attachmentId: attachment.id, reviewId: review.id, userId: auth.userId, s3Key: key, mimeType, kind });

  return NextResponse.json({ attachment: { ...attachment, url } }, { status: 201 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 3600, keyBy: "user", name: "reviews:attachment-upload" });
