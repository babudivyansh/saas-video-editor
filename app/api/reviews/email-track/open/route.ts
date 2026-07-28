import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTrackToken, type DripStage } from "@/lib/reviews/email-track-token";

// 1x1 transparent GIF, returned unconditionally (even for an invalid/expired
// token) — an open-tracking pixel must never surface an error to the mail
// client, it should just silently fail to record.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7", "base64");

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

async function markOpened(userId: string, stage: DripStage) {
  switch (stage) {
    case 1:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email1OpenedAt: null }, data: { email1OpenedAt: new Date() } });
    case 2:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email2OpenedAt: null }, data: { email2OpenedAt: new Date() } });
    case 3:
      return prisma.reviewEmailSequence.updateMany({ where: { userId, email3OpenedAt: null }, data: { email3OpenedAt: new Date() } });
  }
}

// GET /api/reviews/email-track/open?t=<signedToken>&stage=1|2|3 — the stage
// query param is for log readability only; the DB write always trusts the
// VERIFIED token's own stage claim, never the raw query string.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return pixelResponse();

  const payload = verifyTrackToken(token);
  if (!payload) return pixelResponse();

  await markOpened(payload.userId, payload.stage).catch(() => { /* tracking is best-effort, never surfaced to the client */ });

  return pixelResponse();
}
