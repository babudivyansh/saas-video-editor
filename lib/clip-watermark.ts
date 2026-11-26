// Whether an AutoClip clip render carries the free-plan watermark.
//
// Until 2026-11-26 this was "tier === free", full stop, so a free account that
// BOUGHT minutes still got watermarked clips, which made a pack a poor first
// purchase. Now a free account's clips are watermark-free when either:
//   • the run was paid (in part) from purchased minutes, or
//   • it bought a Clip Minutes pack in the last PACK_NO_WATERMARK_DAYS days
//     (bonus minutes drain first, so a run right after buying may not have
//     touched the pack's minutes yet).
// Paid plans are never watermarked, as before. The 720p cap stays with the
// plan (lib/plans/tiers.ts); only the watermark goes.

import { prisma } from "@/lib/prisma";
import { runMinutesRefId } from "@/lib/autoclip-minutes";
import { PACK_NO_WATERMARK_DAYS } from "@/lib/conversion";

export async function clipWatermarkFor(userId: string, projectId: string, now: Date = new Date()): Promise<boolean> {
  // Dynamic, as in the pipeline: lib/auth pulls in the session stack.
  const { getUserTier } = await import("@/lib/auth");
  if ((await getUserTier(userId)) !== "free") return false;
  const paidFromPack = await prisma.minuteTransaction.count({
    where: { userId, refId: runMinutesRefId(projectId), bucket: "purchased", delta: { lt: 0 } },
  });
  if (paidFromPack > 0) return false;
  const since = new Date(now.getTime() - PACK_NO_WATERMARK_DAYS * 24 * 60 * 60 * 1000);
  const recentPack = await prisma.purchase.count({
    where: { userId, status: "captured", createdAt: { gte: since }, plan: { kind: "minute_pack" } },
  });
  return recentPack === 0;
}
