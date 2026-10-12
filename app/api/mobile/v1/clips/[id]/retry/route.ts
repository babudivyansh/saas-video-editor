import type { NextRequest } from "next/server";
import { POST as webRerender } from "@/app/api/projects/[id]/clips/[clipId]/rerender/route";
import { findOwnedClip, getClipDetail } from "@/lib/mobile/projects";
import { callWeb, mobileError, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/clips/:id/retry → the clip, queued again. Re-renders it
// as it is (the web's re-render with no changes): free, with the web's
// fair-use limit; 409 if it's already rendering.
export const POST = withMobileAuth(async (req: NextRequest, auth, { params }: Ctx) => {
  const { id } = await params;
  const owned = await findOwnedClip(auth.userId, id);
  if (!owned) return mobileError(404, "Clip not found");
  const r = await callWeb(webRerender, req, {}, "POST", { id: owned.projectId, clipId: id });
  if (r.status >= 400) return webError(r);
  return mobileJson(await getClipDetail(auth.userId, id));
});
