import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 50);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const cursor = searchParams.get("cursor");
  const offset = cursor ? Math.max(parseInt(cursor, 10) || 0, 0) : 0;

  const where = { userId: auth.userId, ...(unreadOnly ? { readAt: null } : {}) };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit + 1,
    }),
    prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
  ]);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return NextResponse.json({ items, nextCursor: hasMore ? String(offset + limit) : null, unreadCount });
}
