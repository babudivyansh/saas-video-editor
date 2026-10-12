import type { NextRequest } from "next/server";
import { POST as webCancel } from "@/app/api/billing/cancel/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/billing/cancel → { cancelAtPeriodEnd, endsAt }: the
// web's cancel (renewal stops; the plan runs to the end of the paid period).
export const POST = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webCancel, req, {});
  if (r.status >= 400) return webError(r);
  return mobileJson({ cancelAtPeriodEnd: true, endsAt: (r.json.subscriptionEndsAt as string | null) ?? null });
});
