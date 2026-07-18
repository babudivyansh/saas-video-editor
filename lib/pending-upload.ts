import { prisma } from "@/lib/prisma";

/** Confirms a multipart upload session (key + uploadId) belongs to this user
 * before handing out part-upload URLs or completing/aborting it — shared by
 * every route under app/api/upload/multipart/*. */
export async function getOwnedPendingUpload(userId: string, s3Key: string, multipartUploadId: string) {
  return prisma.pendingUpload.findFirst({ where: { userId, s3Key, multipartUploadId } });
}
