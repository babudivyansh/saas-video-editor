import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { startAutoClipRun } from "@/lib/autoclip-start";

// Public API — POST /api/v1/clips: start an AutoClip analysis job for an
// existing project (create the project first via POST /api/v1/projects).
//
// Runs the exact same lib/autoclip-start.ts as the dashboard route, with the
// session-cookie auth swapped for an API key. It used to be a hand-kept copy
// that had drifted: it skipped the free tier's monthly allowance, tier
// priority, and clearing a previous attempt's failureReason.
//
// ⚠ BREAKING CHANGE for existing integrations: clips no longer stop at a
// "pending_review" state and there is no POST .../clips/confirm step. A run is
// charged here, at submit, and renders straight through. Clients that polled
// for pending_review and then confirmed must drop that step; polling for
// "completed" is unchanged. See app/docs/api.
//
// Also stricter than before: numeric fields must be numbers (a string
// "maxDuration" used to be billed at 60s while producing longer clips), and
// out-of-range values are a 400 rather than silently clamped.
export const maxDuration = 30;

async function handlePOST(req: NextRequest) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key does not have write access" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const result = await startAutoClipRun(auth.userId, body);
  return NextResponse.json(result.body, { status: result.status });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "apiKey", name: "v1:clips:create" });
