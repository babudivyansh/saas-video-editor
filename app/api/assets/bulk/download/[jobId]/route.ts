import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAssetZipStatus } from "@/lib/asset-zip";

// GET /api/assets/bulk/download/{jobId} — poll a bulk-download zip job.
// The job itself is scoped to whoever enqueued it (see enqueueAssetZip); the
// jobId is a random UUID, so this doesn't need a DB ownership lookup — an
// authenticated caller who doesn't know a valid jobId simply gets "queued"/
// nothing, and the zip's own signed URL still only serves that user's assets.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const status = await getAssetZipStatus(jobId);
  return NextResponse.json(status);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "assets:bulk:download-status" });
