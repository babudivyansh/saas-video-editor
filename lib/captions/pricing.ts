// Credit pricing and idempotency for provider caption renders.
//
// Deliberately a leaf module — pure functions plus one Config read — so the
// arithmetic can be unit-tested without prisma, Redis, a queue or a provider,
// and so pricing can change without touching any rendering code (§24's "design
// it so pricing can later be changed without touching rendering code").

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { CAPTION_RENDER_PRICING_DEFAULTS, type CaptionRenderPricing } from "./pricingDefaults";

// Shape, defaults and the pure arithmetic live in ./pricingDefaults.ts — a
// leaf module with no prisma, so the create page can quote a premium caption
// price with the SAME function the server charges with. Re-exported here so
// existing import sites are unchanged.
export {
  CAPTION_RENDER_PRICING_DEFAULTS, billableMinutes, estimateCaptionRenderCredits,
  type CaptionRenderPricing,
} from "./pricingDefaults";

export async function getCaptionRenderPricing(): Promise<CaptionRenderPricing> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "caption_render_pricing" } });
    if (!row) return CAPTION_RENDER_PRICING_DEFAULTS;
    return { ...CAPTION_RENDER_PRICING_DEFAULTS, ...(JSON.parse(row.value) as Partial<CaptionRenderPricing>) };
  } catch {
    return CAPTION_RENDER_PRICING_DEFAULTS;
  }
}

/**
 * Billable minutes for a clip.
 *
 * Providers in this category round a partial minute UP to a whole billable one,
 * so a 12-second clip and a 59-second clip cost the same. That is the single
 * most important fact about the unit economics here (§24) and the reason §26
 * insists that not every AutoClip candidate gets rendered: 20 candidates of 30
 * seconds each is 20 billable minutes, not 10.
 *
 * Always at least 1 — there is no such thing as a free zero-minute render.
 */

/** What the user is charged. Internal credits only — provider $ never surfaces. */

/**
 * The ledger refId a render's credits are spent under.
 *
 * Deterministic on purpose, exactly like rerenderRefId in
 * lib/autoclip-rerender.ts: the worker, the webhook and the reconciliation
 * sweep all run outside the original request and must be able to RECONSTRUCT
 * this to refund. A `Date.now()` in here is how a failed job silently never
 * gets refunded.
 */
export const captionRenderRefId = (clipId: string, revision: number) =>
  `caption-render:${clipId}:${revision}`;

export interface IdempotencyInputs {
  clipId: string;
  captionRevision: number;
  templateId: string;
  language: string;
  positionX?: number | null;
  positionY?: number | null;
  hookRevision?: string | null;
  exportWidth?: number;
  exportHeight?: number;
  exportFps?: number;
}

/**
 * A stable fingerprint of everything that affects the rendered output (§21).
 *
 * Stored UNIQUE on CaptionRenderJob, so a duplicate is rejected by Postgres
 * rather than by application timing — double-clicking Export cannot create two
 * paid provider projects even if both requests are in flight at once.
 *
 * captionRevision is in the key so that a genuine caption edit legitimately
 * yields a new render, while re-submitting the same edit does not. Field order
 * is fixed and values are null-normalised so the same inputs always hash the
 * same way.
 */
export function buildIdempotencyKey(input: IdempotencyInputs): string {
  // JSON.stringify of a fixed-length array, NOT a delimiter join. A join is
  // ambiguous whenever a value can contain the delimiter: templateId "a|b" with
  // language "c" produces the same string as templateId "a" with language
  // "b|c", which would silently treat two different renders as the same job and
  // hand the second one the first one's output. templateId is caller-supplied,
  // so that is reachable input, not a hypothetical.
  const canonical = JSON.stringify([
    input.clipId,
    input.captionRevision,
    input.templateId,
    input.language || "auto",
    input.positionX ?? null,
    input.positionY ?? null,
    input.hookRevision ?? null,
    input.exportWidth ?? 1080,
    input.exportHeight ?? 1920,
    input.exportFps ?? 30,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stable fingerprint of the hook, so editing the hook text permits a re-render. */
export function hookRevisionOf(hook: { enabled?: boolean; text?: string; style?: string } | null | undefined): string | null {
  if (!hook?.enabled || !hook.text) return null;
  return createHash("sha256").update(`${hook.text}|${hook.style ?? ""}`).digest("hex").slice(0, 16);
}

/** USD -> the integer micro-USD column. Null in, null out. */
export function toMicroUsd(usd: number | null | undefined): number | null {
  if (usd == null || !Number.isFinite(usd)) return null;
  return Math.round(usd * 1_000_000);
}
