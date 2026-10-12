import type { NextRequest } from "next/server";
import { MAX_COMPETITORS, addCompetitorRequest } from "@clipiro/shared";
import { POST as webAdd } from "@/app/api/social/competitors/route";
import { competitorTrackingConfigured } from "@/lib/social/competitors";
import { listCompetitors, myCompetitorStats } from "@/lib/mobile/social";
import { callWeb, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";

/** The list, plus your own accounts measured the same way (the comparison table's "You" row). */
async function answer(userId: string, enabled: boolean) {
  const [competitors, mine] = await Promise.all([listCompetitors(userId), myCompetitorStats(userId)]);
  return { competitors, enabled, max: MAX_COMPETITORS, mine };
}

// GET /api/mobile/v1/social/competitors → { competitors, enabled, max, mine }:
// followers, engagement rate, posts a week and the 30-day follower change.
export const GET = withMobileSubscriber(async (_req: NextRequest, auth) => mobileJson(await answer(auth.userId, competitorTrackingConfigured())));

// POST /api/mobile/v1/social/competitors { provider, handle } → 201 { competitors, enabled, max, mine }.
// Wraps the web route (its limit of 3, the first fetch, 20 adds an hour).
export const POST = withMobileSubscriber(async (req: NextRequest, auth) => {
  const body = await parseBody(req, addCompetitorRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webAdd, req, body.data);
  if (r.status >= 400) return webError(r);
  return mobileJson(await answer(auth.userId, true), 201);
});
