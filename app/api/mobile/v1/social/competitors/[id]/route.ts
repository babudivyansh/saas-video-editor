import type { NextRequest } from "next/server";
import { MAX_COMPETITORS } from "@clipiro/shared";
import { DELETE as webRemove } from "@/app/api/social/competitors/[id]/route";
import { competitorTrackingConfigured } from "@/lib/social/competitors";
import { listCompetitors, myCompetitorStats } from "@/lib/mobile/social";
import { callWeb, mobileJson, webError, withMobileSubscriber } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/mobile/v1/social/competitors/:id → { competitors, enabled, max }. Wraps the web route.
export const DELETE = withMobileSubscriber(async (req: NextRequest, auth, { params }: Ctx) => {
  const r = await callWeb(webRemove, req, undefined, "DELETE", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  const [competitors, mine] = await Promise.all([listCompetitors(auth.userId), myCompetitorStats(auth.userId)]);
  return mobileJson({ competitors, enabled: competitorTrackingConfigured(), max: MAX_COMPETITORS, mine });
});
