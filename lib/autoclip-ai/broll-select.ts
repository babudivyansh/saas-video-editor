// Filling a clip's B-roll windows — with generated inserts only.
//
// The windows come from the AI edit plan when it ran, else from the clip
// pick's own keyword cues (lib/autoclip-ai/run.ts brollRequestsFor). Each
// window gets an AI still with a slow camera move, or — for an Agency user
// who opted in — an AI video. A window whose generation fails, or that the
// run's spending cap no longer covers, is simply left without an insert.
//
// Stock footage was removed on 2026-11-21: the first Pexels result, never
// looked at and fetched in landscape for vertical clips, rarely matched.

import type { ReframeAspect } from "@/lib/reframe";
import { logger } from "@/lib/logger";
import type { FalRequest } from "@/lib/fal";
import type { AiFeatureSet, AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";
import type { BrollDecision } from "@/lib/autoclip-ai/types";
import { generateImageBroll, submitVideoBroll, motionFor } from "@/lib/autoclip-ai/broll-generate";

/** What Clip.brollWindows stores per window. `url` empty while `pending` is set. */
export interface BrollWindowRow {
  startSec: number;
  endSec: number;
  url: string;
  query: string;
  provider?: string;
  attribution?: string;
  /** A submitted fal video generation, collected at render time. */
  pending?: FalRequest;
}

export interface BrollRequest {
  startSec: number;
  endSec: number;
  queries: string[];
  sentence: string;
  reaction: boolean;
}

export interface BrollRunContext {
  cfg: AutoClipAiConfig;
  features: AiFeatureSet;
  budget: AiBudget;
  aspect: ReframeAspect;
  userId: string;
  projectId: string;
  /** The user opted in to generated video inserts for this run. */
  allowAiVideo: boolean;
}

export async function resolveClipBroll(
  ctx: BrollRunContext,
  clip: { index: number; startSec: number; endSec: number },
  requests: BrollRequest[],
): Promise<{ windows: BrollWindowRow[]; decisions: BrollDecision[] }> {
  const useVideo = ctx.allowAiVideo && ctx.features.brollGenerateVideo;
  if (!useVideo && !ctx.features.brollGenerateImage) return { windows: [], decisions: [] };
  const wanted = requests.slice(0, ctx.cfg.broll.maxGeneratedPerClip);

  // A clip's windows are independent: generate them in parallel.
  const results = await Promise.all(wanted.map(async (req, i): Promise<{ window: BrollWindowRow | null; decision: BrollDecision }> => {
    const query = req.queries[0] ?? "";
    const base = { startSec: req.startSec, endSec: req.endSec };
    const decision = (provider: string | null, why: string | null, externalId: string | null = null, costUsd = 0): BrollDecision =>
      ({ ...base, query, provider, externalId, score: null, why, costUsd });
    try {
      if (useVideo) {
        const pending = await submitVideoBroll({ queries: req.queries, sentence: req.sentence, clip: clip.index, cfg: ctx.cfg, budget: ctx.budget });
        if (pending) {
          return {
            window: { ...base, url: "", query, provider: "ai_video", pending },
            decision: decision("ai_video", null, pending.requestId, ctx.cfg.unitCostUsd.falVideo),
          };
        }
        // Not submitted (over budget, fal down): fall through to a still.
      }
      if (ctx.features.brollGenerateImage) {
        const url = await generateImageBroll({
          queries: req.queries, sentence: req.sentence, aspect: ctx.aspect, durationSec: req.endSec - req.startSec,
          motion: motionFor(i, clip.index),
          userId: ctx.userId, projectId: ctx.projectId, clip: clip.index, cfg: ctx.cfg, budget: ctx.budget,
        });
        if (url) {
          return { window: { ...base, url, query, provider: "ai_image" }, decision: decision("ai_image", null, null, ctx.cfg.unitCostUsd.falImage) };
        }
      }
      return { window: null, decision: decision(null, "generation unavailable or over this run's AI budget") };
    } catch (err) {
      logger.warn("autoclip-ai", `B-roll window ${req.startSec.toFixed(1)}s of clip ${clip.index} failed, leaving it out`, err);
      return { window: null, decision: decision(null, "error") };
    }
  }));

  return {
    windows: results.flatMap((r) => (r.window ? [r.window] : [])).sort((a, b) => a.startSec - b.startSec),
    decisions: results.map((r) => r.decision),
  };
}
