import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/social/export?accountId=…&kind=posts|snapshots
// CSV download of an account's raw tracked data. Doubles as data portability.
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const accountId = req.nextUrl.searchParams.get("accountId");
  const kind = req.nextUrl.searchParams.get("kind") ?? "posts";
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  if (kind !== "posts" && kind !== "snapshots") {
    return NextResponse.json({ error: "kind must be posts or snapshots" }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true, provider: true, username: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let header: string[];
  let rows: Array<Array<string | number | null | undefined>>;
  if (kind === "posts") {
    const posts = await prisma.socialPost.findMany({
      where: { accountId },
      orderBy: { publishedAt: "desc" },
      take: 1000,
    });
    header = ["publishedAt", "mediaType", "caption", "views", "likes", "comments", "shares", "saves", "reach", "watchTimeSec", "permalink"];
    rows = posts.map((p) => [
      p.publishedAt?.toISOString(), p.mediaType, p.caption, p.views, p.likes,
      p.comments, p.shares, p.saves, p.reach, p.watchTimeSec, p.permalink,
    ]);
  } else {
    const snapshots = await prisma.socialAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { capturedAt: "asc" },
      take: 5000,
    });
    header = ["capturedAt", "followers", "views", "impressions", "reach", "engagement"];
    rows = snapshots.map((s) => [s.capturedAt.toISOString(), s.followers, s.views, s.impressions, s.reach, s.engagement]);
  }

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const filename = `${account.provider}-${account.username ?? accountId}-${kind}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
