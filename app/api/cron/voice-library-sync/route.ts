import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { runLibrarySync } from "@/lib/voices/library-sync";
import { withCronTracking } from "@/lib/cron-tracking";

// Hides Voice Library voices their owners have withdrawn — see
// lib/voices/library-sync.ts.
//
//   GET /api/cron/voice-library-sync
//   Authorization: Bearer <CRON_SECRET>
// Cadence: nightly.

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runLibrarySync());
}

export const GET = withCronTracking("voice-library-sync", handleGET);
