import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { resolveUploadPolicy, type UploadFeature } from "@/lib/upload-policy";

const VALID_FEATURES: ReadonlySet<UploadFeature> = new Set([
  "face-swap",
  "background-remover",
  "subtitle-remover",
  "voice-changer",
  "vocal-remover",
  "enhance-speech",
  "audio-balancer",
  "mp3-converter",
  "video-compressor",
  "cut-and-crop",
  "reference-image",
  "ai-creator",
]);

// GET /api/upload-policy?feature=<UploadFeature> — the safe, server-derived
// entitlement a frontend upload surface should read instead of hardcoding a
// byte constant (Upload Limits Audit §17 — "one shared hook/helper/API
// response", not every component recomputing tier limits itself). Tier is
// always resolved from the authenticated session server-side; there is
// nothing client-supplied here to trust or distrust.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  const feature = new URL(req.url).searchParams.get("feature") as UploadFeature | null;
  if (!feature || !VALID_FEATURES.has(feature)) {
    return NextResponse.json({ error: "Unknown or missing 'feature' query param" }, { status: 400 });
  }

  const policy = await resolveUploadPolicy(auth?.userId ?? null, feature);
  return NextResponse.json({
    effectiveMaxBytes: policy.effectiveMaxBytes,
    planMaxBytes: policy.planMaxBytes ?? null,
    featureMaxBytes: policy.featureMaxBytes,
    limitingFactor: policy.limitingFactor,
    planLabel: policy.planLabel,
    tier: policy.tier,
  });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "upload-policy:get" });
