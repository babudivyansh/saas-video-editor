import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;
const SORTS = { publishedAt: "publishedAt", views: "views", likes: "likes", comments: "comments", reach: "reach" } as const;
type SortKey = keyof typeof SORTS;

// Full post list for one owned account (the per-account drill-down view).
// Supports ?sort=publishedAt|views|likes|comments|reach, ?type=<mediaType>,
// ?q=<caption search>, and ?cursor=<id> keyset pagination (PAGE_SIZE rows).
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const q = req.nextUrl.searchParams;
  const accountId = q.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const sort = (q.get("sort") ?? "publishedAt") as SortKey;
  if (!(sort in SORTS)) return NextResponse.json({ error: "invalid sort" }, { status: 400 });
  const type = q.get("type");
  const search = q.get("q");
  const cursor = q.get("cursor");

  const where: Prisma.SocialPostWhereInput = {
    accountId,
    ...(type ? { mediaType: type } : {}),
    ...(search ? { caption: { contains: search, mode: "insensitive" } } : {}),
  };

  const posts = await prisma.socialPost.findMany({
    where,
    // Secondary id ordering makes the keyset cursor stable across equal values.
    orderBy: [{ [SORTS[sort]]: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, providerPostId: true, caption: true, thumbnailUrl: true, permalink: true,
      mediaType: true, publishedAt: true, views: true, likes: true, comments: true,
      shares: true, saves: true, reach: true, watchTimeSec: true,
    },
  });

  const hasMore = posts.length > PAGE_SIZE;
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
  return NextResponse.json({ posts: page, nextCursor: hasMore ? page[page.length - 1].id : null });
}
