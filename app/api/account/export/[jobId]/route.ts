import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAccountExportStatus } from "@/lib/account-export";

// GET /api/account/export/{jobId} — poll a data-export job. Same reasoning
// as the Assets bulk-download status route: the jobId is a random UUID
// minted server-side for whoever enqueued it, so there's no separate
// ownership lookup needed — an authenticated caller who doesn't know a valid
// jobId just gets "queued"/nothing back.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const status = await getAccountExportStatus(jobId);
  return NextResponse.json(status);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "account:export:status" });
