import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { enqueueAccountExport } from "@/lib/account-export";

// POST /api/account/export — enqueues a background job that bundles the
// caller's own data into a downloadable JSON file. Returns immediately with
// a jobId to poll (GET /api/account/export/{jobId}) — building the bundle
// can involve every project/clip/asset/purchase/login-event a user has, so
// this never runs synchronously in the request.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = enqueueAccountExport(auth.userId);
  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 3, windowSec: 3600, keyBy: "user", name: "account:export" });
