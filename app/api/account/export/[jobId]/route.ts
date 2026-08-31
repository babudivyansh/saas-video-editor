import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAccountExportStatus } from "@/lib/account-export";

// GET /api/account/export/{jobId} — poll a data-export job. The jobId is an
// unguessable UUID, but that's obscurity, not authorization: the stored
// record also carries the enqueuing user's id (lib/account-export.ts), and
// this route refuses to hand back a "ready" export (a presigned URL to the
// user's full personal-data bundle) to anyone else who learns the jobId.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const status = await getAccountExportStatus(jobId);
  if (status.userId && status.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, ...publicStatus } = status;
  void userId;
  return NextResponse.json(publicStatus);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "account:export:status" });
