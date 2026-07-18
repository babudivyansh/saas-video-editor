import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { abortMultipartUpload } from "@/utils/s3-upload";
import { getOwnedPendingUpload } from "@/lib/pending-upload";

// POST /api/upload/multipart/abort { key, uploadId } — called when the user
// cancels a large-file upload mid-flight. Releases the S3-side multipart
// session immediately instead of leaving it for the cleanup cron's 30-minute
// grace window.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; uploadId?: string };
  const { key, uploadId } = body;
  if (!key || !uploadId) return NextResponse.json({ error: "key and uploadId are required" }, { status: 400 });

  const pending = await getOwnedPendingUpload(auth.userId, key, uploadId);
  if (!pending) return NextResponse.json({ error: "Upload session not found" }, { status: 404 });

  await abortMultipartUpload(key, uploadId).catch(() => {});
  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});

  return NextResponse.json({ status: "aborted" });
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "upload:multipart:abort" });
