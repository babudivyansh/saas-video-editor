import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAssetZipStatus } from "@/lib/asset-zip";

// GET /api/assets/bulk/download/{jobId} — poll a bulk-download zip job. The
// jobId is an unguessable UUID, but that's obscurity, not authorization: the
// stored record also carries the enqueuing user's id (lib/asset-zip.ts), and
// this route refuses to hand back a "ready" zip's presigned URL to anyone
// else who learns the jobId.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const status = await getAssetZipStatus(jobId);
  if (status.userId && status.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, ...publicStatus } = status;
  void userId;
  return NextResponse.json(publicStatus);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "assets:bulk:download-status" });
