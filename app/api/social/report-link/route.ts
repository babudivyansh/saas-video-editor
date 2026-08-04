import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

// POST { accountId } → a signed, expiring public URL for a read-only report of
// this account. The token carries only the accountId; the public page decides
// what to show (aggregate stats — never OAuth data). Links die after 7 days.
export async function POST(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({
    where: { id: body.accountId, userId: auth.userId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const token = jwt.sign({ accountId: account.id, purpose: "social-report" }, env.JWT_SECRET, { expiresIn: "7d" });
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/report/social/${token}`;
  return NextResponse.json({ url });
}
