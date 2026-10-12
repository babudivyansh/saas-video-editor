import type { NextRequest } from "next/server";
import { renameVoiceRequest } from "@clipiro/shared";
import { removeClonedVoice } from "@/lib/cloned-voices";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { cloneRowId, renameClone, VoiceError } from "@/lib/mobile/voices";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/mobile/v1/voices/cloned/:id { name } → { voice }
export const PATCH = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const body = await parseBody(req, renameVoiceRequest);
  if (!body.ok) return body.res;
  try {
    return mobileJson({ voice: await renameClone(auth.userId, decodeURIComponent((await params).id), body.data.name) });
  } catch (e) {
    if (e instanceof VoiceError) return mobileError(e.status, e.message, { code: e.code });
    throw e;
  }
});

// DELETE /api/mobile/v1/voices/cloned/:id → { ok }: frees the slot at ElevenLabs too.
export const DELETE = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const gone = await removeClonedVoice(auth.userId, cloneRowId(decodeURIComponent((await params).id)));
  return gone ? mobileJson({ ok: true }) : mobileError(404, "That voice isn’t here any more.", { code: "not_found" });
});
