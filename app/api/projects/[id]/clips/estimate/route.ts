import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances } from "@/lib/credits";
import { withRateLimit } from "@/lib/with-rate-limit";
import { computeCreditCost, getAutoClipPricing, getAnalysisCreditsPaid } from "@/lib/autoclip-pipeline";

// POST /api/projects/[id]/clips/estimate  { clips: [{ id, keep, startSec, endSec }] }
//
// What confirming this selection will cost, recomputed as the user toggles and
// trims. The price was previously server-only: the Review step promised "you're
// only charged for what you keep" while showing no number, and the user
// discovered the cost by getting a 402 back from Confirm. That is a trust
// problem, not a convenience one.
//
// Deliberately mirrors the confirm route's arithmetic exactly — including the
// analysis credit already paid being applied as a discount — so the estimate
// and the charge cannot disagree.
const bodySchema = z.object({
  clips: z.array(z.object({
    id: z.string(),
    keep: z.boolean(),
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
  })).max(50),
}).strict();

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const existing = await prisma.clip.findMany({
    where: { projectId, status: "pending_review" },
    select: { id: true, startSec: true, endSec: true },
  });
  const byId = new Map(existing.map((c) => [c.id, c]));

  const kept = parsed.data.clips.filter((e) => e.keep && byId.has(e.id));

  // Confirm rejects end <= start; this route did not, so an inverted window
  // contributed a NEGATIVE duration to the total and could quote a price lower
  // than the real one (even 0), for a selection confirm would then refuse. The
  // two must agree — that's the whole point of this endpoint — so it applies
  // the same rule.
  for (const e of kept) {
    const clip = byId.get(e.id)!;
    const start = e.startSec ?? clip.startSec;
    const end = e.endSec ?? clip.endSec;
    if (end <= start) {
      return NextResponse.json({ error: `Invalid start/end for clip ${e.id}` }, { status: 400 });
    }
  }

  const totalDurationSec = kept.reduce((sum, e) => {
    const clip = byId.get(e.id)!;
    return sum + ((e.endSec ?? clip.endSec) - (e.startSec ?? clip.startSec));
  }, 0);

  const pricing = await getAutoClipPricing();
  const gross = kept.length > 0 ? computeCreditCost(kept.length, totalDurationSec, pricing) : 0;
  const analysisCredit = await getAnalysisCreditsPaid(auth.userId, projectId);
  const total = Math.max(gross - analysisCredit, 0);
  const balances = await getBalances(auth.userId);

  return NextResponse.json({
    clipCount: kept.length,
    totalDurationSec,
    gross,
    // Shown as a discount line: analysis was charged up front and is credited
    // back on confirm, so users who confirm effectively pay nothing for it.
    analysisCredit: Math.min(analysisCredit, gross),
    total,
    balance: balances.total,
    sufficient: balances.total >= total,
  });
}

export const POST = withRateLimit(handlePOST, {
  limit: 60, windowSec: 60, keyBy: "user", name: "auto-clip:estimate",
});
