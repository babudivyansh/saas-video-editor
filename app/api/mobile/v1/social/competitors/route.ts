import type { NextRequest } from "next/server";
import { MAX_COMPETITORS, addCompetitorRequest } from "@clipiro/shared";
import { POST as webAdd } from "@/app/api/social/competitors/route";
import { competitorTrackingConfigured } from "@/lib/social/competitors";
import { listCompetitors } from "@/lib/mobile/social";
import { callWeb, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";

// GET /api/mobile/v1/social/competitors → { competitors, enabled, max }:
// followers, engagement rate, posts a week and the 30-day follower change.
export const GET = withMobileSubscriber(async (_req: NextRequest, auth) =>
  mobileJson({ competitors: await listCompetitors(auth.userId), enabled: competitorTrackingConfigured(), max: MAX_COMPETITORS }),
);

// POST /api/mobile/v1/social/competitors { provider, handle } → 201 { competitors, enabled, max }.
// Wraps the web route (its limit of 3, the first fetch, 20 adds an hour).
export const POST = withMobileSubscriber(async (req: NextRequest, auth) => {
  const body = await parseBody(req, addCompetitorRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webAdd, req, body.data);
  if (r.status >= 400) return webError(r);
  return mobileJson({ competitors: await listCompetitors(auth.userId), enabled: true, max: MAX_COMPETITORS }, 201);
});
