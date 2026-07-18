import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { env } from "@/lib/env";

export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.AWS_S3_BUCKET;

export async function uploadFileToS3(
  filePath: string,
  key: string,
  contentType = "video/mp4"
): Promise<string> {
  const fileStream = fs.createReadStream(filePath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });
  await s3.send(cmd);
  return `https://${BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType = "audio/mpeg",
  /** When set, the object serves with Content-Disposition: attachment, so a
   * plain `<a href={url} download>` reliably downloads it cross-origin
   * instead of the browser just navigating to/displaying it (a real,
   * browser-dependent gap for cross-origin anchors without this header).
   * Only affects top-level navigation to the URL — an <img>/<audio> tag
   * embedding the same URL still displays/plays it inline as normal. */
  downloadName?: string,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ...(downloadName ? { ContentDisposition: `attachment; filename="${downloadName.replace(/[^\x20-\x7E]/g, "_")}"` } : {}),
  });
  await s3.send(cmd);
  return `https://${BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export function sanitizeS3Key(rawKey: string): string {
  // Only allow alphanumeric, hyphens, underscores, dots, and forward-slashes
  return rawKey.replace(/[^a-zA-Z0-9\-_./]/g, "");
}

export function s3KeyToPublicUrl(key: string): string {
  const safeKey = sanitizeS3Key(key);
  return `https://${BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${safeKey}`;
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Streams an S3 object straight to a local path — used by background jobs
 * (thumbnail extraction, moderation) that need the bytes on disk for ffmpeg
 * or Rekognition, without the extra round-trip of minting a presigned URL
 * first just to immediately GET it. */
export async function downloadS3ObjectToFile(key: string, destPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) throw new Error(`S3 object ${key} has no body`);
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await pipeline(res.Body as NodeJS.ReadableStream, fs.createWriteStream(destPath));
}

// Server-trusted MIME → extension map. The upload route's key construction
// must derive the extension from this (the validated Content-Type), never
// from the client-supplied filename — a filename with no "." would otherwise
// make the whole name become the "extension" and inject "/"/".." into the S3
// key (audit finding: app/api/upload/route.ts previously did exactly that).
export const MIME_TO_EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "video/mpeg": "mpeg",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}

/**
 * Resolves a stored S3 key to a URL safe to hand to a client, honoring the
 * signed-URL security model: never returns a permanent public link.
 *
 * If CDN_BASE_URL is configured (a CloudFront distribution has been
 * provisioned in front of the bucket), URLs are served through it. Until a
 * signed-URL/signed-cookie key group is added to that distribution, treat
 * CDN_BASE_URL as a caching layer, not an access-control boundary — the
 * default (unset) path below, a short-lived S3 presigned URL, is the actual
 * enforcement point today.
 */
export async function getAssetReadUrl(key: string, expiresIn = 6 * 3600): Promise<string> {
  if (env.CDN_BASE_URL) {
    return `${env.CDN_BASE_URL.replace(/\/$/, "")}/${sanitizeS3Key(key)}`;
  }
  return getPresignedUrl(key, expiresIn);
}

// ── Multipart upload (large-file pause/resume) ──────────────────────────────
// A single PutObjectCommand can't be paused/resumed mid-flight; S3 multipart
// upload can, since each part is an independently retryable PUT. Used by
// app/api/upload/multipart/* for files over the client's single-shot
// threshold (see useUploadQueue.ts).

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("S3 did not return an UploadId for CreateMultipartUpload");
  return res.UploadId;
}

/** A presigned PUT URL for one part — the client uploads the part bytes directly to S3. */
export async function getMultipartPartUploadUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600
): Promise<string> {
  const cmd = new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
): Promise<void> {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}

// Used when adopting an already-uploaded render (e.g. an AutoClip clip) as an
// Asset without re-uploading it — Asset.size is required, so this fetches it
// via a HEAD request instead of re-reading the file.
export async function getS3ObjectSize(key: string): Promise<number> {
  const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.ContentLength ?? 0;
}
