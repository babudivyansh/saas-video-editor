import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) }).strict();

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = voteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { value } = parsed.data;

  const review = await prisma.review.findFirst({ where: { id, status: "published" } });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.userId === auth.userId) return NextResponse.json({ error: "You cannot vote on your own review" }, { status: 403 });

  const existing = await prisma.reviewHelpfulVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId: auth.userId } } });

  if (existing && existing.value === value) {
    const current = await prisma.review.findUnique({ where: { id }, select: { helpfulCount: true, notHelpfulCount: true } });
    return NextResponse.json({ myVote: value, ...current });
  }

  const counterDelta = (v: number, delta: number) => (v === 1 ? { helpfulCount: { increment: delta } } : { notHelpfulCount: { increment: delta } });

  const updated = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.reviewHelpfulVote.update({ where: { id: existing.id }, data: { value } });
      return tx.review.update({
        where: { id },
        data: { ...counterDelta(existing.value, -1), ...counterDelta(value, 1) },
        select: { helpfulCount: true, notHelpfulCount: true },
      });
    }
    await tx.reviewHelpfulVote.create({ data: { reviewId: id, userId: auth.userId, value } });
    return tx.review.update({ where: { id }, data: counterDelta(value, 1), select: { helpfulCount: true, notHelpfulCount: true } });
  });

  return NextResponse.json({ myVote: value, ...updated });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.reviewHelpfulVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId: auth.userId } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const counterDelta = existing.value === 1 ? { helpfulCount: { decrement: 1 } } : { notHelpfulCount: { decrement: 1 } };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.reviewHelpfulVote.delete({ where: { id: existing.id } });
    return tx.review.update({ where: { id }, data: counterDelta, select: { helpfulCount: true, notHelpfulCount: true } });
  });

  return NextResponse.json({ myVote: null, ...updated });
}

// Chained: per-user budget is the primary limit; the outer per-IP limiter
// catches an attacker cycling through many accounts from one machine.
export const POST = withRateLimit(
  withRateLimit(handlePOST, { limit: 30, windowSec: 3600, keyBy: "user", name: "reviews:vote" }),
  { limit: 60, windowSec: 3600, keyBy: "ip", name: "reviews:vote-ip" },
);
export const DELETE = withRateLimit(handleDELETE, { limit: 30, windowSec: 3600, keyBy: "user", name: "reviews:vote-delete" });
