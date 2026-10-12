import type { NextRequest } from "next/server";
import { captionIdeasRequest } from "@clipiro/shared";
import { POST as webCaptions } from "@/app/api/social/captions/route";
import { callWeb, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";

type Ideas = { captions?: { text: string; tone: string }[]; hashtags?: string[] };

// POST /api/mobile/v1/social/captions?tz= { accountId, brief, tone? } → { captions, hashtags }:
// the web's caption ideas for the Composer (charged, its limits).
export const POST = withMobileSubscriber(async (req: NextRequest) => {
  const body = await parseBody(req, captionIdeasRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webCaptions, req, { ...body.data, tz: req.nextUrl.searchParams.get("tz") ?? "UTC" });
  if (r.status >= 400) return webError(r);
  const ideas = ((r.json.data as { captions?: Ideas } | undefined)?.captions ?? {}) as Ideas;
  return mobileJson({
    captions: ideas.captions ?? [],
    hashtags: (ideas.hashtags ?? []).map((t) => `#${t.replace(/^#+/, "")}`),
  });
});
