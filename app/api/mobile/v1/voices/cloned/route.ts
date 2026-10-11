import type { NextRequest } from "next/server";
import { cloneVoiceRequest, MAX_CLONED_VOICES } from "@clipiro/shared";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { cloneFromAsset, cloningEnabled, listClones, VoiceError } from "@/lib/mobile/voices";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/voices/cloned → { enabled, max, voices }: the person's
// cloned voices, and whether cloning is switched on (VOICE_CLONING_ENABLED).
export const GET = withMobileAuth(async (_req: NextRequest, auth) =>
  mobileJson({ enabled: cloningEnabled(), max: MAX_CLONED_VOICES, voices: await listClones(auth.userId) }),
);

// POST /api/mobile/v1/voices/cloned { name, assetId, consent: true } → 201 { voice }:
// clones a voice from an audio sample in Assets. 503 "cloning_unavailable"
// while switched off; 409 "voice_limit" at the cap.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, cloneVoiceRequest);
    if (!body.ok) return body.res;
    try {
      return mobileJson({ voice: await cloneFromAsset(auth.userId, body.data.name, body.data.assetId) }, 201);
    } catch (e) {
      if (e instanceof VoiceError) return mobileError(e.status, e.message, { code: e.code });
      throw e;
    }
  }),
  { limit: 5, windowSec: 3600, keyBy: "user", name: "mobile:voice-clone" },
);
