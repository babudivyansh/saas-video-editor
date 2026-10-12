import type { NextRequest } from "next/server";
import { DELETE as webRevoke } from "@/app/api/social/report-link/[id]/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/mobile/v1/social/share-links/:id → { ok }: revoked at once.
// Not subscriber-gated, as on the web: a lapsed plan can still shut a link off.
export const DELETE = withMobileAuth(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webRevoke, req, undefined, "DELETE", { id: (await params).id });
  return r.status >= 400 ? webError(r) : mobileJson({ ok: true });
});
