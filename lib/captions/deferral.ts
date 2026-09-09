// Decides whether renderOneClip should SKIP burning captions itself because a
// provider is going to add them.
//
// The problem this solves: Submagic captions a finished video. If Clipiro has
// already burned captions in, the provider adds a second set on top of the
// first — two caption tracks, permanently, in the exported MP4. So exactly one
// of the two must do it.
//
// Deferring is the right default when a provider render is genuinely going to
// follow, and wrong the moment it isn't — an uncaptioned clip is a worse
// outcome than an un-animated one. Hence the last check below: once a provider
// render for this clip has FAILED, we stop deferring, and the ordinary
// re-render burns the template's native ASS approximation instead. That is what
// closes the loop on §31 — the user loses the animation, never the captions.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCaptionTemplate, isProviderTemplate } from "@/lib/caption-templates";
import { getCaptionRenderer } from "./CaptionRendererFactory";

export interface DeferralContext {
  clipId: string;
  /** From Clip.subtitleStyleOverride.templateId. */
  templateId: string | undefined;
  tier?: string;
  durationSec?: number;
}

/**
 * True = renderOneClip produces a clean video and the provider adds captions.
 * False = burn them natively, as always.
 *
 * Never throws: any uncertainty resolves to false, because burning captions is
 * the safe answer. A wrongly-deferred clip ships with no captions at all; a
 * wrongly-burned one just doesn't get the premium animation.
 */
export async function shouldDeferCaptionsToProvider(ctx: DeferralContext): Promise<boolean> {
  try {
    if (!ctx.templateId) return false;

    const template = getCaptionTemplate(ctx.templateId);
    if (!template || !isProviderTemplate(template)) return false;

    // Ask the same factory the render path will ask. If it would fall back to
    // native right now — flag off, tier ineligible, breaker open, provider
    // unconfigured — there is no provider render coming, so burn them here.
    const decision = await getCaptionRenderer(template, {
      tier: ctx.tier,
      clipDurationSec: ctx.durationSec,
    });
    if (!decision.renderer.paid) return false;

    // A provider render for this clip already failed. Don't defer again, or the
    // clip stays uncaptioned forever: this re-render IS the fallback.
    const failed = await prisma.captionRenderJob.count({
      where: { clipId: ctx.clipId, status: "failed" },
    });
    if (failed > 0) return false;

    return true;
  } catch (err) {
    logger.warn("captions", "deferral check failed — burning captions natively");
    void err;
    return false;
  }
}
