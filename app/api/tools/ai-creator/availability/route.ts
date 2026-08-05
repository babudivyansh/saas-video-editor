import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { env } from "@/lib/env";

// Lets the wizard show a graceful "not available right now" state before the
// user uploads a video and picks an avatar, instead of only discovering the
// tool is unconfigured after a failed Generate — the same class of gap
// lib/social/providers.ts's isProviderConfigured() closes for Social Tracker.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const available = Boolean(
    env.FAL_KEY && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET,
  );

  return NextResponse.json({ available });
}
