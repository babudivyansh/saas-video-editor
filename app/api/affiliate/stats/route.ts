import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { maskEmail } from "@/lib/mask-email";

// The dashboard shows the most recent referrals as cards; nine fills three
// rows of three.
const RECENT_REFERRALS = 9;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.userId },
    include: {
      referrals: { select: { id: true, status: true } },
      commissions: { select: { amount: true, status: true } },
    },
  });

  if (!affiliate) {
    return NextResponse.json({ enrolled: false });
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://clipiro.com";

  // Who was referred, masked: an affiliate sees "a***@gmail.com", never the
  // referred user's address. Fraud states read as "review" rather than
  // telling the affiliate a referral was judged fraudulent.
  const recent = await prisma.referral.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { signedUpAt: "desc" },
    take: RECENT_REFERRALS,
    select: {
      id: true,
      status: true,
      signedUpAt: true,
      referredUser: { select: { email: true } },
      commissions: { select: { amount: true, status: true } },
    },
  });
  const recentReferrals = recent.map((r) => ({
    id: r.id,
    label: maskEmail(r.referredUser?.email),
    signedUpAt: r.signedUpAt.toISOString(),
    status: r.status === "converted" ? "converted" : r.status === "signed_up" ? "signed_up" : "review",
    commission: parseFloat(
      r.commissions.filter((c) => c.status !== "rejected").reduce((s, c) => s + c.amount, 0).toFixed(2),
    ),
  }));

  const pendingAmount = affiliate.commissions
    .filter(c => c.status === "pending")
    .reduce((s, c) => s + c.amount, 0);

  const availableAmount = affiliate.commissions
    .filter(c => c.status === "available")
    .reduce((s, c) => s + c.amount, 0);

  return NextResponse.json({
    enrolled: true,
    code: affiliate.code,
    referralLink: `${baseUrl}/register?ref=${affiliate.code}`,
    status: affiliate.status,
    totalReferrals: affiliate.referrals.length,
    convertedReferrals: affiliate.referrals.filter(r => r.status === "converted").length,
    pendingAmount: parseFloat(pendingAmount.toFixed(2)),
    availableAmount: parseFloat(availableAmount.toFixed(2)),
    totalEarned: parseFloat(affiliate.totalEarned.toFixed(2)),
    totalPaid: parseFloat(affiliate.totalPaid.toFixed(2)),
    recentReferrals,
  });
}
