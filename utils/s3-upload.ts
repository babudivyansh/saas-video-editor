import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
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
  contentType = "audio/mpeg"
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
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
