import { ok, withSocial } from "@/lib/social/api";
import { getOverview } from "@/lib/social/service";
import { availableProviders } from "@/lib/social/providers";

// Dashboard payload: linked accounts + latest metrics + recent posts + trend
// snapshots, plus which providers this deployment can connect. Token fields
// are never selected (see service.overviewSelect).
//
// On the {data} envelope now that the v1 page is gone — every /api/social route
// answers in one shape, so a client never has to remember which vintage of the
// API it is talking to.
export const GET = withSocial(async (_req, { auth }) => {
  const data = await getOverview(auth.userId);
  return ok({ ...data, providers: availableProviders() });
}, {
  rateLimit: { key: (auth) => `social:accounts:${auth.userId}`, max: 60, windowSec: 60 },
});
