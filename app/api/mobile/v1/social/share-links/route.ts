import type { NextRequest } from "next/server";
import { shareLinkRequest } from "@clipiro/shared";
import { POST as webLink } from "@/app/api/social/report-link/route";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";
import { shareLinkName } from "@/lib/mobile/social";
import { prisma } from "@/lib/prisma";

/** What a link shows: the web's default sections. */
const SECTIONS = ["kpis", "trends", "content"];

// POST /api/mobile/v1/social/share-links { accountIds, days } → 201 { link, url }.
// The web's revocable read-only link (at most 10 active: 409 code
// limit_reached). The URL is only ever returned here.
export const POST = withMobileSubscriber(async (req: NextRequest, auth) => {
  const body = await parseBody(req, shareLinkRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webLink, req, { accountIds: body.data.accountIds, sections: SECTIONS, expiresInDays: body.data.days });
  if (r.status >= 400) return webError(r);
  const data = r.json.data as { url?: string; link?: { id: string; accountIds: string[]; sections: string[]; expiresAt: string } } | undefined;
  if (!data?.url || !data.link) return mobileError(500, "The link was made but couldn't be read back. Pull to refresh.");
  const accounts = await prisma.socialAccount.findMany({ where: { userId: auth.userId, id: { in: data.link.accountIds } }, select: { id: true, provider: true } });
  const name = shareLinkName(data.link.accountIds, data.link.sections, new Map(accounts.map((a) => [a.id, a.provider])));
  return mobileJson({ link: { id: data.link.id, name, views: 0, expiresAt: new Date(data.link.expiresAt).toISOString() }, url: data.url }, 201);
});
