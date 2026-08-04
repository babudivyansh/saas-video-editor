import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HttpError, parseBody, withSocial } from "@/lib/social/api";
import { competitorSchema } from "@/lib/social/schemas";
import {
  addCompetitor, competitorTrackingConfigured, listCompetitors, MAX_COMPETITORS,
} from "@/lib/social/competitors";

// GET  → the user's tracked competitors with follower trend snapshots.
// POST → { provider, handle } add one (vendor-fetches the initial snapshot).
//
// The handle regex and the @-stripping now live in competitorSchema, shared
// with every other place a handle is accepted. addCompetitor still validates
// too — it is called from the cron path as well, where no zod schema runs.
export const GET = withSocial(async (_req, { auth }) => {
  const competitors = await listCompetitors(auth.userId);
  return NextResponse.json({
    competitors,
    enabled: competitorTrackingConfigured(),
    max: MAX_COMPETITORS,
  });
}, {
  rateLimit: { key: (auth) => `social:competitors:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, competitorSchema);
  const result = await addCompetitor(auth.userId, body.provider, body.handle);
  // addCompetitor returns its own status for "not configured" (503), "unknown
  // platform" (400) and "limit reached" (409) — passed through rather than
  // flattened, because those three mean genuinely different things to a user.
  if (!result.ok) throw new HttpError(result.status, result.error);
  return NextResponse.json({ id: result.id }, { status: 201 });
}, {
  rateLimit: { key: (auth) => `social:competitors:write:${auth.userId}`, max: 20, windowSec: 3600 },
});
