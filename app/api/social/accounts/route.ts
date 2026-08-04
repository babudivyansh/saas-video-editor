import { NextResponse } from "next/server";
import { withSocial } from "@/lib/social/api";
import { getOverview } from "@/lib/social/service";
import { availableProviders } from "@/lib/social/providers";

// Dashboard payload: linked accounts + latest metrics + recent posts + trend
// snapshots, plus which providers this deployment can connect. Token fields
// are never selected (see service.overviewSelect).
//
// On withSocial for the auth gate, the error mapping and the rate limit, but
// deliberately NOT on the {data} envelope: the v1 page reads this shape
// top-level, and changing it here would break that page a stage early. Stage 10
// retrofits the envelope once v1 is gone.
export const GET = withSocial(async (_req, { auth }) => {
  const data = await getOverview(auth.userId);
  return NextResponse.json({ ...data, providers: availableProviders() });
}, {
  rateLimit: { key: (auth) => `social:accounts:${auth.userId}`, max: 60, windowSec: 60 },
});
