import type { NextRequest } from "next/server";
import { DELETE as webDisconnect } from "@/app/api/social/accounts/[id]/route";
import { callWeb, mobileJson, webError, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/mobile/v1/social/accounts/:id → { ok }: disconnect (the web's:
// tokens revoked and wiped). Not subscriber-gated, as on the web — anyone can
// remove their linked data.
export const DELETE = withMobileAuth(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webDisconnect, req, undefined, "DELETE", { id: (await params).id });
  return r.status >= 400 ? webError(r) : mobileJson({ ok: true });
});
