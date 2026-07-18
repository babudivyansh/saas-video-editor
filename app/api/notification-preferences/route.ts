import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getNotificationPreference, upsertNotificationPreference } from "@/lib/notifications";

const EDITABLE_KEYS = [
  "marketingEmails", "productUpdates", "usageAlerts", "creditAlerts",
  "weeklySummary", "featureReleases", "newsletter",
] as const;

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await getNotificationPreference(auth.userId);
  return NextResponse.json({ preferences: pref });
}

async function handlePATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, boolean> = {};
  for (const key of EDITABLE_KEYS) {
    if (typeof body[key] === "boolean") updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preference fields provided" }, { status: 400 });
  }

  const pref = await upsertNotificationPreference(auth.userId, updates);
  return NextResponse.json({ preferences: pref });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "notification-prefs:get" });
export const PATCH = withRateLimit(handlePATCH, { limit: 30, windowSec: 60, keyBy: "user", name: "notification-prefs:patch" });
