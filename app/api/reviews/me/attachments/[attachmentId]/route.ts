import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteS3Object } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { attachmentId } = await params;

  const attachment = await prisma.reviewAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.reviewAttachment.delete({ where: { id: attachmentId } });
  await deleteS3Object(attachment.s3Key).catch((e) =>
    logger.warn("reviews", `failed to delete S3 object for attachment ${attachmentId}`, { reason: (e as Error).message }),
  );
  if (attachment.thumbnailS3Key) {
    await deleteS3Object(attachment.thumbnailS3Key).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
