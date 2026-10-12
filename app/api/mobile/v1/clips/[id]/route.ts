import type { NextRequest } from "next/server";
import { clipPatchRequest } from "@clipiro/shared";
import { DELETE as webDelete, PATCH as webPatch } from "@/app/api/projects/[id]/clips/[clipId]/route";
import { findOwnedClip, getClipDetail } from "@/lib/mobile/projects";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/clips/:id → the clip, its signed video and what its
// virality score is made of.
export const GET = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const clip = await getClipDetail(auth.userId, (await params).id);
  return clip ? mobileJson(clip) : mobileError(404, "Clip not found");
});

// PATCH /api/mobile/v1/clips/:id { favorite?, title? } → the clip. Wraps the
// web route (renaming never re-renders).
export const PATCH = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const body = await parseBody(req, clipPatchRequest);
  if (!body.ok) return body.res;
  const owned = await findOwnedClip(auth.userId, id);
  if (!owned) return mobileError(404, "Clip not found");
  const { title, favorite } = body.data;
  const r = await callWeb(webPatch, req, { ...(title !== undefined ? { title } : {}), ...(favorite !== undefined ? { isFavorite: favorite } : {}) }, "PATCH", {
    id: owned.projectId,
    clipId: id,
  });
  if (r.status >= 400) return webError(r);
  return mobileJson(await getClipDetail(auth.userId, id));
});

// DELETE /api/mobile/v1/clips/:id → { ok }. Wraps the web route.
export const DELETE = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const owned = await findOwnedClip(auth.userId, id);
  if (!owned) return mobileError(404, "Clip not found");
  const r = await callWeb(webDelete, req, undefined, "DELETE", { id: owned.projectId, clipId: id });
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
