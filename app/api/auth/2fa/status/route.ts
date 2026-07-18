import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auth/2fa/status — lightweight check for the Security settings UI.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { twoFactorEnabled: true, _count: { select: { recoveryCodes: { where: { usedAt: null } } } } },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ enabled: user.twoFactorEnabled, unusedRecoveryCodes: user._count.recoveryCodes });
}
