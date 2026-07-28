import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTrackToken, type DripStage } from "@/lib/reviews/email-track-token";

const SITE_URL = "https://clipiro.com";

async function markClicked(userId: string, stage: DripStage) {
  switch (stage) {
    case 1:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email1ClickedAt: null }, data: { email1ClickedAt: new Date() } });
    case 2:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email2ClickedAt: null }, data: { email2ClickedAt: new Date() } });
    case 3:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email3ClickedAt: null }, data: { email3ClickedAt: new Date() } });
  }
}

// GET /api/reviews/email-track/click?t=<signedToken>&stage=1|2|3&to=<url> —
// records the click (best-effort, never blocks the redirect) then 302s to
// `to`. `to` must resolve to a same-origin clipiro.com URL — this is a public,
// unauthenticated redirect endpoint reachable from any inbox, so an
// unchecked `to` would be an open-redirect vector.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const to = req.nextUrl.searchParams.get("to");
  const fallback = NextResponse.redirect(`${SITE_URL}/dashboard`);
  if (!token || !to) return fallback;

  let target: URL;
  try {
    target = new URL(to, SITE_URL);
  } catch {
    return fallback;
  }
  if (target.origin !== SITE_URL) return fallback;

  const payload = verifyTrackToken(token);
  if (payload) {
    await markClicked(payload.userId, payload.stage).catch(() => { /* tracking is best-effort, never blocks the redirect */ });
  }

  return NextResponse.redirect(target);
}
