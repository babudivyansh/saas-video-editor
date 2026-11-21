// Stage 2 — choosing a B-roll insert, or choosing none.
//
// Two rankers, one contract: given the sentence being illustrated and a pool
// of candidates, score every candidate 0-100.
//
//   * Gemini vision looks at the candidates' preview stills next to the
//     sentence. No new infrastructure; the default.
//   * Embeddings (SigLIP on the GPU service) compare the sentence with each
//     still in a shared space. Cheaper per call at volume, and the only way to
//     search the creator's own library, whose stills are embedded once and
//     stored on the Asset row.
//
// A score under the Config threshold means NO insert: a wrong cutaway is worse
// than none.

import fs from "fs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { isAllowedStockUrl } from "@/lib/stock-hosts";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { isGpuConfigured, runEmbed, type EmbedResult } from "@/lib/gpu-service";
import { geminiJson } from "@/lib/autoclip-ai/gemini";
import type { AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";
import type { BrollCandidate, LibraryAssetRow } from "@/lib/autoclip-ai/broll-sources";

/** Most stills sent to Gemini in one ranking call. */
export const MAX_VISION_CANDIDATES = 10;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

// ── Preview stills ──────────────────────────────────────────────────────────

/** A URL the GPU service can fetch for this candidate's still, or null. */
export async function previewUrlFor(c: BrollCandidate): Promise<string | null> {
  if ("path" in c.preview) return null;
  const url = c.preview.url;
  if (url.startsWith("s3key:")) return getAssetReadUrl(url.slice("s3key:".length), 60 * 60).catch(() => null);
  return isAllowedStockUrl(url, "broll") ? url : null;
}

async function previewBytes(c: BrollCandidate): Promise<{ data: string; mimeType: string } | null> {
  try {
    if ("path" in c.preview) {
      const buf = fs.readFileSync(/*turbopackIgnore: true*/ c.preview.path);
      return buf.length <= MAX_PREVIEW_BYTES ? { data: buf.toString("base64"), mimeType: "image/jpeg" } : null;
    }
    const url = await previewUrlFor(c);
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.api) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PREVIEW_BYTES) return null;
    return { data: buf.toString("base64"), mimeType: type.split(";")[0] };
  } catch {
    return null;
  }
}

// ── Gemini vision ───────────────────────────────────────────────────────────

const visionAnswer = z.object({
  scores: z.array(z.object({ i: z.number().int().min(0), score: z.number().min(0).max(100) })).max(40),
  why: z.string().max(300).optional(),
});

export async function rankWithGeminiVision(args: {
  sentence: string;
  queries: string[];
  candidates: BrollCandidate[];
  budget: AiBudget;
  cfg: AutoClipAiConfig;
  clip: number;
}): Promise<{ scores: (number | null)[]; why: string | null } | null> {
  const pool = args.candidates.slice(0, MAX_VISION_CANDIDATES);
  if (pool.length === 0) return null;
  if (!args.budget.tryReserve("broll_rank_vision", args.cfg.unitCostUsd.geminiVision, args.clip)) return null;
  const images = await Promise.all(pool.map(previewBytes));
  const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [
    `A short-form video cuts away for 2-4 seconds while the speaker says:\n"${args.sentence.slice(0, 400)}"\n` +
    `The editor searched for: ${args.queries.map((q) => `"${q}"`).join(", ")}.\n` +
    `Score each numbered image 0-100 for how well it works as that cutaway: does it SHOW what is being said, ` +
    `is it good-looking footage, is it free of text, logos and watermarks. 0 for unrelated or unusable.\n` +
    `Return JSON {"scores":[{"i":<image number>,"score":<0-100>}],"why":"<one short reason for the best one>"}.`,
  ];
  pool.forEach((_, i) => {
    const img = images[i];
    if (!img) return;
    parts.push(`Image ${i}:`);
    parts.push({ inlineData: img });
  });
  if (parts.length === 1) return null;
  const answer = await geminiJson({ label: "broll-rank", parts, schema: visionAnswer, timeoutMs: 30_000, temperature: 0.1 });
  if (!answer) return null;
  const scores: (number | null)[] = pool.map(() => null);
  for (const s of answer.scores) if (s.i < pool.length && images[s.i]) scores[s.i] = s.score;
  return { scores: [...scores, ...args.candidates.slice(MAX_VISION_CANDIDATES).map(() => null)], why: answer.why ?? null };
}

// ── Embeddings ──────────────────────────────────────────────────────────────

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** SigLIP's pairwise probability, as a 0-100 score. */
export function siglipScore(cos: number, logitScale: number, logitBias: number): number {
  const p = 1 / (1 + Math.exp(-(cos * logitScale + logitBias)));
  return Math.round(p * 1000) / 10;
}

export async function rankWithEmbeddings(args: {
  sentence: string;
  candidates: BrollCandidate[];
  budget: AiBudget;
  cfg: AutoClipAiConfig;
  clip: number;
}): Promise<{ scores: (number | null)[]; model: string } | null> {
  if (!isGpuConfigured() || args.candidates.length === 0) return null;
  if (!args.budget.tryReserve("broll_rank_embed", args.cfg.unitCostUsd.gpuEmbed, args.clip)) return null;
  const needImage = args.candidates.map((c) => !c.embedding);
  const urls = await Promise.all(args.candidates.map((c, i) => (needImage[i] ? previewUrlFor(c) : Promise.resolve(null))));
  let res: EmbedResult;
  try {
    res = await runEmbed({ texts: [args.sentence.slice(0, 300)], imageUrls: urls.filter((u): u is string => !!u) });
  } catch (err) {
    logger.warn("autoclip-ai", "embedding ranker unavailable", err);
    return null;
  }
  const text = res.textEmbeddings[0];
  if (!text) return null;
  let k = 0;
  const scores = args.candidates.map((c, i) => {
    let emb = c.embedding ?? null;
    if (needImage[i]) {
      emb = urls[i] ? (res.imageEmbeddings[k++] ?? null) : null;
    }
    return emb ? siglipScore(cosine(text, emb), res.logitScale, res.logitBias) : null;
  });
  return { scores, model: res.model };
}

/**
 * Embed library stills that don't have an embedding for the current model,
 * and store them. Bounded per run; the rest are picked up by later runs.
 * Returns the model id, or null when the GPU service isn't usable.
 */
export async function ensureLibraryEmbeddings(args: {
  rows: LibraryAssetRow[];
  budget: AiBudget;
  cfg: AutoClipAiConfig;
  maxPerRun?: number;
}): Promise<string | null> {
  if (!isGpuConfigured()) return null;
  const known = args.rows.find((r) => r.aiEmbeddingModel)?.aiEmbeddingModel ?? null;
  const todo = args.rows.filter((r) => !r.aiEmbeddingModel || (known && r.aiEmbeddingModel !== known)).slice(0, args.maxPerRun ?? 32);
  if (todo.length === 0) return known;
  if (!args.budget.tryReserve("library_embed", args.cfg.unitCostUsd.gpuEmbed)) return known;
  const urls = await Promise.all(todo.map((r) => (r.thumbnailS3Key ? getAssetReadUrl(r.thumbnailS3Key, 60 * 60).catch(() => null) : null)));
  const withUrl = todo.map((r, i) => ({ r, url: urls[i] })).filter((x): x is { r: LibraryAssetRow; url: string } => !!x.url);
  if (withUrl.length === 0) return known;
  try {
    const res = await runEmbed({ texts: [], imageUrls: withUrl.map((x) => x.url) });
    await Promise.all(withUrl.map(({ r }, i) => {
      const emb = res.imageEmbeddings[i];
      if (!emb) return null;
      r.aiEmbedding = emb;
      r.aiEmbeddingModel = res.model;
      return prisma.asset.update({ where: { id: r.id }, data: { aiEmbedding: emb, aiEmbeddingModel: res.model } }).catch(() => null);
    }));
    return res.model;
  } catch (err) {
    logger.warn("autoclip-ai", "library embedding backfill failed", err);
    return known;
  }
}

// ── Choosing ────────────────────────────────────────────────────────────────

/**
 * The winner of a scored pool: the user's own footage gets a small bonus, a
 * clip already used in this run is excluded, and nothing below the threshold
 * wins. Pure.
 */
export function pickWinner(
  candidates: BrollCandidate[],
  scores: (number | null)[],
  opts: { threshold: number; libraryBonus: number; used: Set<string> },
): { candidate: BrollCandidate; score: number } | null {
  let best: { candidate: BrollCandidate; score: number } | null = null;
  candidates.forEach((c, i) => {
    const raw = scores[i];
    if (raw == null || opts.used.has(`${c.provider}:${c.externalId}`)) return;
    const score = Math.min(100, raw + (c.provider === "library" ? opts.libraryBonus : 0));
    if (score < opts.threshold) return;
    if (!best || score > best.score) best = { candidate: c, score };
  });
  return best;
}
