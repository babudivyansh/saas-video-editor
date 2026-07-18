import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

const HISTORY_LIMIT = 20;

// GET /api/auth/login-history — the user-facing counterpart to the
// admin-only login-history view (app/admin/users/[id]/page.tsx) reading the
// same LoginEvent rows. Closes the audit finding that this data existed but
// a regular user could never see their own sign-in history.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.loginEvent.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { id: true, ip: true, device: true, country: true, createdAt: true },
  });

  return NextResponse.json({ events });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "login-history:list" });
