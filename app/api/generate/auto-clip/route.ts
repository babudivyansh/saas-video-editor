import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { withRateLimit } from "@/lib/with-rate-limit";
import { startAutoClipRun } from "@/lib/autoclip-start";

// The dashboard's AutoClip create route. Everything about starting a run —
// validation, the free-tier allowance, the caption plan gate, the kill-switch
// and the enqueue — lives in lib/autoclip-start.ts, shared with the public
// v1 API so the two can no longer drift apart. See that file.
//
// The actual analysis (download, transcribe, face tracking, Gemini) runs on
// the render queue, so this only validates and enqueues.
export const maxDuration = 30;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Malformed JSON is a 400, not a 500.
  const body = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const result = await startAutoClipRun(auth.userId, body);
  if (result.status === 200) void markQuestComplete(auth.userId, "first-clip");
  return NextResponse.json(result.body, { status: result.status });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:auto-clip" });

// GET — the caller's balances, shown beside Generate. Reads only; the run
// estimate itself is computed client-side with estimateRunCost.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ getBalances }, { getMinuteBalances }] = await Promise.all([
    import("@/lib/credits"),
    import("@/lib/minutes"),
  ]);
  const [balances, minutes] = await Promise.all([getBalances(auth.userId), getMinuteBalances(auth.userId)]);
  // `balance` is the CREDIT balance (the minutes overflow is paid in credits);
  // `minutes` is the Clip Minutes balance a run spends.
  return NextResponse.json({ balance: balances.total, minutes: minutes.total });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "generate:auto-clip:pricing" });
