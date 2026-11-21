// The AI stages for one AutoClip run, called from pickJob once the clips are
// chosen and their signal tracks exist.
//
//   Phase A, per clip (bounded concurrency): edit plan, scene vision, subject
//   tracking. Independent of each other's clips.
//   Phase B, per clip: B-roll — needs Phase A of EVERY clip, because a shot
//   Gemini labelled in one clip can be another clip's cutaway.
//
// Each phase has a wall-clock budget well inside pickJob's 30-minute watchdog;
// a clip that hasn't finished by then simply gets no AI for that phase. Every
// step is best-effort: a failure is recorded in aiMeta.skipped and the clip
// renders the way it would have without it.

import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "@/lib/logger";
import { classifySource } from "@/lib/source-url";
import type { WordTiming } from "@/utils/elevenlabs";
import type { SignalTrack } from "@/lib/signal-track";
import { computeBrollWindow, planBrollWindows, type BrollCue } from "@/lib/broll";
import type { TierId } from "@/lib/plans/tiers";
import { getAutoClipAiConfig, resolveAiFeatures, type AiFeatureSet, type AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import { AiBudget } from "@/lib/autoclip-ai/budget";
import { generateEditPlan, type ResolvedEditPlan } from "@/lib/autoclip-ai/edit-plan";
import { analyzeClipScenes } from "@/lib/autoclip-ai/scene-vision";
import { trackClipSubjects } from "@/lib/autoclip-ai/subject-track";
import { loadLibraryAssets, libraryCandidates, type BrollCandidate } from "@/lib/autoclip-ai/broll-sources";
import { ensureLibraryEmbeddings } from "@/lib/autoclip-ai/broll-rank";
import { extractFrame } from "@/lib/autoclip-ai/broll-generate";
import { resolveClipBroll, type BrollRequest, type BrollWindowRow } from "@/lib/autoclip-ai/broll-select";
import type { AiMeta, SceneShot, SubjectTrack } from "@/lib/autoclip-ai/types";
import type { AiReframeInput } from "@/lib/autoclip-ai/reframe-ai";

type Aspect = "9:16" | "16:9" | "1:1";

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
   * B-roll windows chosen by the AI path. `undefined` = this run used the
   * pick's own B-roll path (both editPlan and brollRank off).
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
const SOURCE_POOL_MAX = 12;
const SOURCE_CUTAWAY_SEC = 4;

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
  /** Injected in tests. */
  cfg?: AutoClipAiConfig;
}): Promise<AiRunResult | null> {
  const cfg = args.cfg ?? await getAutoClipAiConfig();
  const features = resolveAiFeatures(cfg, args.tier);
  if (!Object.values(features).some(Boolean)) return null;

  const budget = new AiBudget(cfg.costCeilingUsd[args.tier] ?? 0);
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

  // ── Phase B: B-roll ──
  const aiBroll = features.editPlan || features.brollRank;
  const brollWindows: (BrollWindowRow[] | undefined)[] = args.clips.map(() => (aiBroll ? [] : undefined));
  const decisions: AiMeta["broll"][] = args.clips.map(() => undefined);
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `autoclip-ai-${args.projectId}-`));
  try {
    if (aiBroll) {
      let library: BrollCandidate[] = [];
      if (features.brollRank && cfg.broll.providers.library) {
        try {
          const rows = await loadLibraryAssets(args.userId, args.sourceAssetId);
          const model = rows.length ? await ensureLibraryEmbeddings({ rows, budget, cfg }) : null;
          library = model ? libraryCandidates(rows, model) : [];
        } catch (err) {
          logger.warn("autoclip-ai", "library B-roll unavailable for this run", err);
        }
      }
      // Shots elsewhere in this video that read as cutaways.
      const sourcePool: BrollCandidate[] = [];
      if (features.brollRank && cfg.broll.providers.source) {
        const shots = args.clips.flatMap((c, i) => (scenes[i] ?? [])
          .filter((s) => (s.type === "screen" || s.type === "product" || s.type === "broll_like") && s.confidence >= 70 && s.endSec - s.startSec >= 2)
          .map((s) => ({ startSec: c.start + s.startSec, endSec: c.start + Math.min(s.endSec, s.startSec + SOURCE_CUTAWAY_SEC) })))
          .slice(0, SOURCE_POOL_MAX);
        for (const [k, s] of shots.entries()) {
          const still = path.join(frameDir, `src-${k}.jpg`);
          if (await extractFrame(args.videoPath, (s.startSec + s.endSec) / 2, still)) {
            sourcePool.push({
              provider: "source", externalId: `${s.startSec.toFixed(2)}`, preview: { path: still }, downloadUrl: "",
              width: 0, height: 0, durationSec: s.endSec - s.startSec, sourceWindow: s,
            });
          }
        }
      }
      const ctx = {
        cfg, features, budget, aspect: args.aspect, userId: args.userId, projectId: args.projectId,
        videoPath: args.videoPath, used: new Set<string>(), library, sourcePool, allowAiVideo: args.allowAiVideo,
      };
      await pool(args.clips, CONCURRENCY, Date.now() + PHASE_B_MS, async (clip, i) => {
        const requests = brollRequestsFor(clip, plans[i]);
        if (requests.length === 0) return;
        const r = await resolveClipBroll(ctx, { index: clip.index, startSec: clip.start, endSec: clip.end }, requests);
        brollWindows[i] = r.windows;
        decisions[i] = r.decisions;
      });
    }
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ frameDir, { recursive: true, force: true });
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
