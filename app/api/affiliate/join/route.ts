import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUniqueCode } from "@/lib/affiliate";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.affiliate.findUnique({ where: { userId: user.userId } });
  if (existing) {
    const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://clipiro.ai";
    return NextResponse.json({
      code: existing.code,
      referralLink: `${baseUrl}/signup?ref=${existing.code}`,
    });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true, firstName: true },
  });
  const name = dbUser?.name ?? dbUser?.firstName ?? "USR";
  const code = await createUniqueCode(name);

  const affiliate = await prisma.affiliate.create({
    data: { userId: user.userId, code },
  });

  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://clipiro.ai";
  return NextResponse.json({
    code: affiliate.code,
    referralLink: `${baseUrl}/signup?ref=${affiliate.code}`,
  });
}
