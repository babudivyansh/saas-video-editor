import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lightweight poll target for the bell badge — the bell polls this every
// 45-60s and only fetches the full list (GET /api/notifications) on open.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadCount = await prisma.notification.count({ where: { userId: auth.userId, readAt: null } });
  return NextResponse.json({ unreadCount });
}
