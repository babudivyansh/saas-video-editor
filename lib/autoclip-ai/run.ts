// The AI stages for one AutoClip run, called from pickJob once the clips are
// chosen and their signal tracks exist.
//
//   Phase A, per clip (bounded concurrency): edit plan, scene vision, subject
//   tracking. Independent of each other's clips.
//   Phase B, per clip: generated B-roll — after Phase A, because the edit
//   plan decides where the windows go when it ran.
//
// Each phase has a wall-clock budget well inside pickJob's 30-minute watchdog;
// a clip that hasn't finished by then simply gets no AI for that phase. Every
// step is best-effort: a failure is recorded in aiMeta.skipped and the clip
// renders the way it would have without it.

import type { ReframeAspect } from "@/lib/reframe";
import { logger } from "@/lib/logger";
import { classifySource } from "@/lib/source-url";
import type { WordTiming } from "@/utils/elevenlabs";
import type { SignalTrack } from "@/lib/signal-track";
import { computeBrollWindow, planBrollWindows, type BrollCue } from "@/lib/broll";
import type { TierId } from "@/lib/plans/tiers";
import { getAutoClipAiConfig, resolveAiFeatures, runCeilingUsd, type AiFeatureSet, type AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import { AiBudget } from "@/lib/autoclip-ai/budget";
import { generateEditPlan, type ResolvedEditPlan } from "@/lib/autoclip-ai/edit-plan";
import { analyzeClipScenes } from "@/lib/autoclip-ai/scene-vision";
import { trackClipSubjects } from "@/lib/autoclip-ai/subject-track";
import { resolveClipBroll, type BrollRequest, type BrollRunContext, type BrollWindowRow } from "@/lib/autoclip-ai/broll-select";
import type { AiMeta, SceneShot, SubjectTrack } from "@/lib/autoclip-ai/types";
import type { AiReframeInput } from "@/lib/autoclip-ai/reframe-ai";

type Aspect = ReframeAspect;

export interface AiClipInput {
  index: number;
  /** Source seconds. */
  start: number;
  end: number;
  title: string;
  /** Clip-relative words. */
  words: WordTiming[];
  signal: SignalTrack;
  /** The pick's own B-roll suggestions, used when there is no edit plan. */
  brollCues: BrollCue[];
  brollQuery: string | null;
  brollOffsetSec: number | null;
}

export interface AiClipResult {
  aiMeta: AiMeta;
  /** Feed for computeClipCrop. */
  reframe: Omit<AiReframeInput, "faces" | "words" | "smoothness" | "trackingSpeed">;
  /**
   * Generated B-roll windows. `undefined` = this clip asked for none, or
   * B-roll generation is off for this tier — either way, no B-roll.
   */
  brollWindows?: BrollWindowRow[];
}

export interface AiRunResult {
  features: AiFeatureSet;
  clips: AiClipResult[];
  spentUsd: number;
}

const PHASE_A_MS = 8 * 60 * 1000;
const PHASE_B_MS = 6 * 60 * 1000;
const CONCURRENCY = 3;

/** Run `work` over `items` with a pool, stopping new work at `deadline`. Unfinished items stay undefined. */
async function pool<T, R>(items: T[], size: number, deadlineAt: number, work: (item: T, i: number) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const runner = async () => {
    while (next < items.length && Date.now() < deadlineAt) {
      const i = next++;
      out[i] = await work(items[i], i);
    }
  };
  await Promise.race([
    Promise.all(Array.from({ length: Math.min(size, items.length) }, runner)),
    new Promise<void>((r) => setTimeout(r, Math.max(0, deadlineAt - Date.now())).unref?.()),
  ]);
  return [...out];
}

/** The B-roll a clip asks for: the edit plan's, else the pick's keyword cues, else its single suggestion. */
export function brollRequestsFor(clip: AiClipInput, plan: ResolvedEditPlan | null): BrollRequest[] {
  const duration = clip.end - clip.start;
  const sentenceAround = (startSec: number) => {
    const i = clip.words.findIndex((w) => w.end / 1000 >= startSec);
    const from = Math.max(0, (i < 0 ? clip.words.length : i) - 8);
    return clip.words.slice(from, from + 16).map((w) => w.word).join(" ");
  };
  if (plan && plan.broll.length > 0) {
    return plan.broll.map((b) => ({ startSec: b.startSec, endSec: b.endSec, queries: b.queries, sentence: b.sentence, reaction: b.reaction }));
  }
  const planned = planBrollWindows(clip.brollCues, clip.words, duration);
  if (planned.length > 0) {
    return planned.map((p) => ({ startSec: p.startSec, endSec: p.endSec, queries: [p.query], sentence: sentenceAround(p.startSec), reaction: false }));
  }
  if (!clip.brollQuery) return [];
  const w = computeBrollWindow(duration, clip.brollOffsetSec);
  return w ? [{ ...w, queries: [clip.brollQuery], sentence: sentenceAround(w.startSec), reaction: false }] : [];
}

export async function runAiStages(args: {
  tier: TierId;
  projectId: string;
  userId: string;
  uploadedVideoUrl: string;
  sourceAssetId: string | null;
  videoPath: string;
  aspect: Aspect;
  instructions: string;
  allowAiVideo: boolean;
  clips: AiClipInput[];
  /** Source length; shrinks the spend cap on a short source (runCeilingUsd). */
  sourceDurationSec?: number;
  /** Injected in tests. */
  cfg?: AutoClipAiConfig;
}): Promise<AiRunResult | null> {
  const cfg = args.cfg ?? await getAutoClipAiConfig();
  const features = resolveAiFeatures(cfg, args.tier);
  if (!Object.values(features).some(Boolean)) return null;

  const budget = new AiBudget(runCeilingUsd(cfg, args.tier, args.sourceDurationSec));
  const skipped: string[][] = args.clips.map(() => []);
  const plans: (ResolvedEditPlan | null)[] = args.clips.map(() => null);
  const scenes: (SceneShot[] | null)[] = args.clips.map(() => null);
  const tracks: (SubjectTrack[] | null)[] = args.clips.map(() => null);

  // A URL the GPU service may fetch (tracking). Never a foreign key.
  let gpuVideoUrl: string | null = null;
  if (features.subjectTrack && features.sceneVision) {
    const src = await classifySource(args.uploadedVideoUrl, args.userId, 60 * 60).catch(() => null);
    gpuVideoUrl = src?.kind === "owned" ? src.url : src?.kind === "external" ? args.uploadedVideoUrl : null;
  }

  // ── Phase A ──
  await pool(args.clips, CONCURRENCY, Date.now() + PHASE_A_MS, async (clip, i) => {
    const duration = clip.end - clip.start;
    const [plan, sc] = await Promise.all([
      features.editPlan && budget.tryReserve("edit_plan", cfg.unitCostUsd.geminiText, clip.index)
        ? generateEditPlan({ words: clip.words, clipDurationSec: duration, title: clip.title, aspect: args.aspect, instructions: args.instructions })
            .then((p) => { if (!p) skipped[i].push("editPlan"); return p; })
        : Promise.resolve(null),
      features.sceneVision
        ? analyzeClipScenes({
            videoPath: args.videoPath, clipStartSec: clip.start, clipEndSec: clip.end,
            shotBoundaries: clip.signal.scenes ?? [], clip: clip.index, cfg, budget,
          }).then((s) => { if (!s) skipped[i].push("sceneVision"); return s; })
        : Promise.resolve(null),
    ]);
    plans[i] = plan;
    scenes[i] = sc;
    if (features.subjectTrack && sc && gpuVideoUrl) {
      tracks[i] = await trackClipSubjects({ videoUrl: gpuVideoUrl, clipStartSec: clip.start, scenes: sc, clip: clip.index, cfg, budget });
    }
  });

  // ── Phase B: generated B-roll ──
  // The only B-roll there is. Off (both generation features off for this
  // tier) means no B-roll at all.
  const brollOn = features.brollGenerateImage || (features.brollGenerateVideo && args.allowAiVideo);
  const brollWindows: (BrollWindowRow[] | undefined)[] = args.clips.map(() => undefined);
  const decisions: AiMeta["broll"][] = args.clips.map(() => undefined);
  if (brollOn) {
    const ctx: BrollRunContext = {
      cfg, features, budget, aspect: args.aspect, userId: args.userId, projectId: args.projectId, allowAiVideo: args.allowAiVideo,
    };
    await pool(args.clips, CONCURRENCY, Date.now() + PHASE_B_MS, async (clip, i) => {
      const requests = brollRequestsFor(clip, plans[i]);
      if (requests.length === 0) return;
      const r = await resolveClipBroll(ctx, { index: clip.index, startSec: clip.start, endSec: clip.end }, requests);
      brollWindows[i] = r.windows;
      decisions[i] = r.decisions;
    });
  }

  const clips: AiClipResult[] = args.clips.map((clip, i) => ({
    aiMeta: {
      v: 1,
      features,
      editPlan: plans[i],
      ...(decisions[i] ? { broll: decisions[i] } : {}),
      shots: clip.signal.scenes ?? [],
      ...(scenes[i] ? { scenes: scenes[i]! } : {}),
      ...(tracks[i] ? { tracks: tracks[i]! } : {}),
      cost: budget.forClip(clip.index),
      ...(skipped[i].length ? { skipped: skipped[i] } : {}),
    },
    reframe: {
      features,
      shots: clip.signal.scenes ?? [],
      scenes: scenes[i],
      tracks: tracks[i],
      planLayout: plans[i]?.layout ?? null,
    },
    brollWindows: brollWindows[i],
  }));
  logger.info("autoclip-ai", `AI stages for ${args.projectId}: $${budget.spentUsd.toFixed(4)} of $${budget.ceilingUsd}`);
  return { features, clips, spentUsd: budget.spentUsd };
}
