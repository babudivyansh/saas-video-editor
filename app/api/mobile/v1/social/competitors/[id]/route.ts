import type { NextRequest } from "next/server";
import { MAX_COMPETITORS } from "@clipiro/shared";
import { DELETE as webRemove } from "@/app/api/social/competitors/[id]/route";
import { competitorTrackingConfigured } from "@/lib/social/competitors";
import { listCompetitors } from "@/lib/mobile/social";
import { callWeb, mobileJson, webError, withMobileSubscriber } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/mobile/v1/social/competitors/:id → { competitors, enabled, max }. Wraps the web route.
export const DELETE = withMobileSubscriber(async (req: NextRequest, auth, { params }: Ctx) => {
  const r = await callWeb(webRemove, req, undefined, "DELETE", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  return mobileJson({ competitors: await listCompetitors(auth.userId), enabled: competitorTrackingConfigured(), max: MAX_COMPETITORS });
});
