// What the billing Usage tab shows: credits from the Generation ledger AND
// Clip Minutes from the MinuteTransaction ledger.
//
// Until 2026-11 the tab read Generation.creditsCost alone. Auto Clip moved to
// Clip Minutes in 2026-09 and logs its Generation row with creditsCost 0, so a
// customer who had spent hundreds of minutes saw "0 credits" and "−0" on every
// row — it looked like usage was never recorded. Minutes live in their own
// ledger (see lib/minutes.ts) and are netted per spend refId here, so a run
// that failed and was refunded counts as nothing.

import { prisma } from "@/lib/prisma";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { TOOL_COSTS } from "@/lib/tool-costs";

// Title-casing a slug gets these wrong ("Youtube Downloader", "Cut And Crop").
const WORD_OVERRIDES: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", ai: "AI", mp3: "MP3", "4k": "4K", and: "and",
};

export function usageDisplayName(modelId: string | null, toolSlug: string): string {
  if (modelId) {
    const found = IMAGE_MODELS.find(m => m.id === modelId);
    if (found) return found.displayName;
  }
  return toolSlug
    .split("-")
    .filter(Boolean)
    .map(w => WORD_OVERRIDES[w] ?? w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** The tool's list price in credits, or null when it isn't a flat-priced tool
 *  (image models, per-unit audio). 0 means the tool is free — the UI says
 *  "Free" rather than "−0". */
export function listCreditCost(toolSlug: string): number | null {
  return TOOL_COSTS[toolSlug]?.creditCost ?? null;
}

export interface MinuteSpend {
  refId: string;
  /** From the spend reason, "spend:<toolSlug>". */
  toolSlug: string;
  /** Net of any refund against the same refId; always > 0. */
  minutes: number;
  createdAt: Date;
}

/** Every Clip Minute spend since `since`, netted per refId. */
export async function minuteSpendsSince(userId: string, since: Date): Promise<MinuteSpend[]> {
  const rows = await prisma.minuteTransaction.findMany({
    where: {
      userId,
      createdAt: { gte: since },
      refId: { not: null },
      OR: [{ reason: { startsWith: "spend:" } }, { reason: { startsWith: "refund" } }],
    },
    select: { refId: true, delta: true, reason: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byRef = new Map<string, { toolSlug: string | null; minutes: number; createdAt: Date | null }>();
  for (const r of rows) {
    const entry = byRef.get(r.refId!) ?? { toolSlug: null, minutes: 0, createdAt: null };
    entry.minutes -= r.delta;
    if (r.reason.startsWith("spend:")) {
      entry.toolSlug ??= r.reason.slice("spend:".length);
      entry.createdAt ??= r.createdAt;
    }
    byRef.set(r.refId!, entry);
  }

  const out: MinuteSpend[] = [];
  for (const [refId, e] of byRef) {
    // A refund row whose spend predates the window has no toolSlug — skip it.
    if (e.toolSlug && e.createdAt && e.minutes > 0) {
      out.push({ refId, toolSlug: e.toolSlug, minutes: e.minutes, createdAt: e.createdAt });
    }
  }
  return out;
}

/** Net Clip Minutes still held per refId, for the given refIds only. */
export async function netMinutesByRefId(userId: string, refIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (refIds.length === 0) return result;
  const rows = await prisma.minuteTransaction.findMany({
    where: { userId, refId: { in: refIds } },
    select: { refId: true, delta: true },
  });
  for (const r of rows) result.set(r.refId!, (result.get(r.refId!) ?? 0) - r.delta);
  for (const [k, v] of result) if (v <= 0) result.delete(k);
  return result;
}
