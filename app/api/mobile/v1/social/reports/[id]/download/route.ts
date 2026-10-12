import type { NextRequest } from "next/server";
import { GET as webRun } from "@/app/api/social/reports/[id]/route";
import { callWeb, mobileError, mobileJson, webError, withMobileSubscriber } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/social/reports/:id/download → { url, filename }: a
// short-lived signed link to a finished report (409 code not_ready before).
export const GET = withMobileSubscriber(async (req: NextRequest, _auth, { params }: Ctx) => {
  const r = await callWeb(webRun, req, undefined, "GET", { id: (await params).id });
  if (r.status >= 400) return webError(r);
  const data = r.json.data as { run?: { format?: string; periodEnd?: string }; downloadUrl?: string | null } | undefined;
  if (!data?.downloadUrl) return mobileError(409, "This report isn't ready yet.", { code: "not_ready" });
  const date = String(data.run?.periodEnd ?? new Date().toISOString()).slice(0, 10);
  return mobileJson({ url: data.downloadUrl, filename: `clipiro-report-${date}.${data.run?.format ?? "pdf"}` });
});
