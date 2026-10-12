import type { NextRequest } from "next/server";
import { POST as webRefresh } from "@/app/api/social/accounts/[id]/route";
import { callWeb, mobileJson, webError, withMobileSubscriber } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/mobile/v1/social/accounts/:id/sync → { ok }: re-sync now. Wraps the
// web route: once per account per 10 minutes (it spends provider quota).
export const POST = withMobileSubscriber(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webRefresh, req, {}, "POST", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  return mobileJson({ ok: true });
});
