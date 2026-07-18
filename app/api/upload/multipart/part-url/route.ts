import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getMultipartPartUploadUrl } from "@/utils/s3-upload";
import { getOwnedPendingUpload } from "@/lib/pending-upload";

// POST /api/upload/multipart/part-url { key, uploadId, partNumber }
// Step 2 (called once per chunk) — the client PUTs the chunk bytes directly
// to S3 via this presigned URL, so multi-hundred-MB files never pass through
// the Next.js server a second time.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; uploadId?: string; partNumber?: number };
  const { key, uploadId, partNumber } = body;
  if (!key || !uploadId || !partNumber || partNumber < 1 || partNumber > 10_000) {
    return NextResponse.json({ error: "key, uploadId, and a valid partNumber are required" }, { status: 400 });
  }

  const owned = await getOwnedPendingUpload(auth.userId, key, uploadId);
  if (!owned) return NextResponse.json({ error: "Upload session not found" }, { status: 404 });

  const url = await getMultipartPartUploadUrl(key, uploadId, partNumber);
  return NextResponse.json({ url });
}

export const POST = withRateLimit(handlePOST, { limit: 600, windowSec: 60, keyBy: "user", name: "upload:multipart:part-url" });
