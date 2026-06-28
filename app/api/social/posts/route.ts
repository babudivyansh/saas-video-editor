import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Full post list for one owned account (the per-account drill-down view).
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const posts = await prisma.socialPost.findMany({
    where: { accountId },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true, providerPostId: true, caption: true, thumbnailUrl: true, permalink: true,
      mediaType: true, publishedAt: true, views: true, likes: true, comments: true,
      shares: true, saves: true, reach: true, watchTimeSec: true,
    },
  });
  return NextResponse.json({ posts });
}
