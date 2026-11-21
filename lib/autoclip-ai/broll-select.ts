// Stage 2 — filling a clip's B-roll windows.
//
// For each window the edit plan (or the pick's keyword cues) asked for:
//   1. gather candidates: every enabled stock provider, the creator's own
//      library, and shots from elsewhere in this same video;
//   2. score them (Gemini vision, or embeddings) and keep the best one that
//      clears the threshold and hasn't been used earlier in the run;
//   3. nothing cleared it: a generated insert if the tier allows, otherwise no
//      insert at all.
// With brollRank off this is the old behaviour exactly: first Pexels result.

import { pickBroll } from "@/lib/broll";
import { logger } from "@/lib/logger";
import type { FalRequest } from "@/lib/fal";
import type { AiFeatureSet, AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";
import type { BrollDecision } from "@/lib/autoclip-ai/types";
import { searchStockPool, type BrollCandidate } from "@/lib/autoclip-ai/broll-sources";
import { rankWithGeminiVision, rankWithEmbeddings, pickWinner, MAX_VISION_CANDIDATES } from "@/lib/autoclip-ai/broll-rank";
import { generateImageBroll, submitVideoBroll, materializeSourceCutaway } from "@/lib/autoclip-ai/broll-generate";

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
  aspect: "9:16" | "16:9" | "1:1";
  userId: string;
  projectId: string;
  videoPath: string;
  /** provider:externalId already used in this run. */
  used: Set<string>;
  /** Library candidates (already embedded), or empty. */
  library: BrollCandidate[];
  /** Shots from elsewhere in the source ("source" provider), absolute times. */
  sourcePool: BrollCandidate[];
  /** The user opted in to generated video inserts for this run. */
  allowAiVideo: boolean;
}

const LIBRARY_IN_VISION = 2;
const SOURCE_IN_VISION = 2;

async function scorePool(
  ctx: BrollRunContext, clip: number, req: BrollRequest, stock: BrollCandidate[], library: BrollCandidate[], source: BrollCandidate[],
): Promise<{ pool: BrollCandidate[]; scores: (number | null)[]; why: string | null }> {
  // The library can only be scored with embeddings (that's what it stores).
  let libTop: BrollCandidate[] = [];
  if (library.length > 0) {
    const lib = await rankWithEmbeddings({ sentence: req.sentence, candidates: library, budget: ctx.budget, cfg: ctx.cfg, clip });
    if (lib) {
      libTop = library
        .map((c, i) => ({ c, s: lib.scores[i] ?? -1 }))
        .filter((x) => x.s >= ctx.cfg.broll.threshold - 25)
        .sort((a, b) => b.s - a.s)
        .slice(0, LIBRARY_IN_VISION)
        .map((x) => x.c);
      if (ctx.cfg.broll.ranker === "embedding") {
        const rest = [...source, ...stock];
        const r = await rankWithEmbeddings({ sentence: req.sentence, candidates: rest, budget: ctx.budget, cfg: ctx.cfg, clip });
        return { pool: [...library, ...rest], scores: [...lib.scores, ...(r?.scores ?? rest.map(() => null))], why: null };
      }
    }
  }

  const pool = [...libTop, ...source.slice(0, SOURCE_IN_VISION), ...stock].slice(0, MAX_VISION_CANDIDATES);
  if (ctx.cfg.broll.ranker === "embedding") {
    const r = await rankWithEmbeddings({ sentence: req.sentence, candidates: pool, budget: ctx.budget, cfg: ctx.cfg, clip });
    return { pool, scores: r?.scores ?? pool.map(() => null), why: null };
  }
  const v = await rankWithGeminiVision({ sentence: req.sentence, queries: req.queries, candidates: pool, budget: ctx.budget, cfg: ctx.cfg, clip });
  if (v) return { pool, scores: v.scores, why: v.why };
  // Vision unavailable: embeddings if the GPU is there, else nothing wins.
  const r = await rankWithEmbeddings({ sentence: req.sentence, candidates: pool, budget: ctx.budget, cfg: ctx.cfg, clip });
  return { pool, scores: r?.scores ?? pool.map(() => null), why: null };
}

/** Source shots that don't overlap this clip's own window (a cutaway to itself is no cutaway). */
export function sourceCandidatesFor(pool: BrollCandidate[], clipStartSec: number, clipEndSec: number): BrollCandidate[] {
  return pool.filter((c) => c.sourceWindow && (c.sourceWindow.endSec <= clipStartSec || c.sourceWindow.startSec >= clipEndSec));
}

export async function resolveClipBroll(
  ctx: BrollRunContext,
  clip: { index: number; startSec: number; endSec: number },
  requests: BrollRequest[],
): Promise<{ windows: BrollWindowRow[]; decisions: BrollDecision[] }> {
  const windows: BrollWindowRow[] = [];
  const decisions: BrollDecision[] = [];
  let generated = 0;

  for (const req of requests) {
    const query = req.queries[0] ?? "";
    const base = { startSec: req.startSec, endSec: req.endSec };
    const costBefore = ctx.budget.forClip(clip.index).reduce((s, e) => s + e.usd, 0);
    const decide = (d: Omit<BrollDecision, "startSec" | "endSec" | "costUsd" | "query">) => {
      const costAfter = ctx.budget.forClip(clip.index).reduce((s, e) => s + e.usd, 0);
      decisions.push({ ...base, query, costUsd: Math.round((costAfter - costBefore) * 10_000) / 10_000, ...d });
    };

    try {
      if (!ctx.features.brollRank) {
        const hit = query ? await pickBroll(query) : null;
        if (hit) windows.push({ ...base, url: hit.downloadUrl, query, provider: "pexels" });
        decide({ provider: hit ? "pexels" : null, externalId: null, score: null, why: null });
        continue;
      }

      const stock = await searchStockPool({ queries: req.queries, aspect: ctx.aspect, reaction: req.reaction, cfg: ctx.cfg });
      const library = req.reaction || !ctx.cfg.broll.providers.library ? [] : ctx.library;
      const source = req.reaction || !ctx.cfg.broll.providers.source ? [] : sourceCandidatesFor(ctx.sourcePool, clip.startSec, clip.endSec);
      const { pool, scores, why } = await scorePool(ctx, clip.index, req, stock, library, source);
      const win = pickWinner(pool, scores, { threshold: ctx.cfg.broll.threshold, libraryBonus: ctx.cfg.broll.libraryBonus, used: ctx.used });

      if (win) {
        const c = win.candidate;
        // Claimed synchronously, before any await: clips are filled
        // concurrently, and two of them must not both win the same insert.
        const usedKey = `${c.provider}:${c.externalId}`;
        ctx.used.add(usedKey);
        let url: string | null = c.downloadUrl;
        if (c.provider === "source" && c.sourceWindow) {
          const len = Math.min(req.endSec - req.startSec + 0.3, c.sourceWindow.endSec - c.sourceWindow.startSec);
          url = await materializeSourceCutaway({
            videoPath: ctx.videoPath, startSec: c.sourceWindow.startSec, endSec: c.sourceWindow.startSec + len,
            userId: ctx.userId, projectId: ctx.projectId, clip: clip.index,
          });
        }
        if (!url) ctx.used.delete(usedKey);
        if (url) {
          windows.push({ ...base, url, query, provider: c.provider, ...(c.attribution ? { attribution: c.attribution } : {}) });
          decide({ provider: c.provider, externalId: c.externalId, score: Math.round(win.score), why });
          continue;
        }
      }

      // Nothing good enough. Generate, if this tier and run allow it.
      if (!req.reaction && generated < ctx.cfg.broll.maxGeneratedPerClip) {
        if (ctx.allowAiVideo && ctx.features.brollGenerateVideo) {
          const pending = await submitVideoBroll({ queries: req.queries, sentence: req.sentence, clip: clip.index, cfg: ctx.cfg, budget: ctx.budget });
          if (pending) {
            generated++;
            windows.push({ ...base, url: "", query, provider: "ai_video", pending });
            decide({ provider: "ai_video", externalId: pending.requestId, score: null, why: "no stock clip cleared the threshold" });
            continue;
          }
        }
        if (ctx.features.brollGenerateImage) {
          const url = await generateImageBroll({
            queries: req.queries, sentence: req.sentence, aspect: ctx.aspect, durationSec: req.endSec - req.startSec,
            userId: ctx.userId, projectId: ctx.projectId, clip: clip.index, cfg: ctx.cfg, budget: ctx.budget,
          });
          if (url) {
            generated++;
            windows.push({ ...base, url, query, provider: "ai_image" });
            decide({ provider: "ai_image", externalId: null, score: null, why: "no stock clip cleared the threshold" });
            continue;
          }
        }
      }
      decide({ provider: null, externalId: null, score: win ? Math.round(win.score) : null, why: "nothing cleared the threshold" });
    } catch (err) {
      logger.warn("autoclip-ai", `B-roll window ${req.startSec.toFixed(1)}s of clip ${clip.index} failed, leaving it out`, err);
      decide({ provider: null, externalId: null, score: null, why: "error" });
    }
  }
  return { windows, decisions };
}
