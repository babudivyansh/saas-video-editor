import type { NextRequest } from "next/server";
import { POST as webResume } from "@/app/api/billing/resume/route";
import { callWeb, mobileError, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/billing/resume → { cancelAtPeriodEnd: false, endsAt }.
// Razorpay can't switch renewal back on once cancelled; the web then says to
// choose a new plan, which the app can't offer (Play policy, BILLING.md), so
// it answers 409 "cannot_resume" in words that sell nothing.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const r = await callWeb(webResume, req, {});
  if (r.status === 409 && r.json.requiresNewSubscription) {
    return mobileError(409, "Renewal can’t be switched back on for this plan. It stays active until the end of the paid period.", { code: "cannot_resume" });
  }
  if (r.status >= 400) return webError(r);
  return mobileJson({ cancelAtPeriodEnd: false, endsAt: (r.json.subscriptionEndsAt as string | null) ?? null });
});
