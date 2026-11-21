// Stage 2 — where B-roll candidates come from.
//
// Every provider answers the same question (a visual query, an orientation, a
// count) with the same candidate shape, so the ranker can compare a Pexels
// clip, a Pixabay clip and a shot from the creator's own library side by side.
// A provider with no key, switched off in Config, or failing is skipped and
// logged — never an error: B-roll is an enhancement, and one vendor being down
// must not cost the clip its other sources.

import { GiphyFetch } from "@giphy/js-fetch-api";
import { env } from "@/lib/env";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { searchStockVideos, StockNotConfiguredError, type StockOrientation } from "@/lib/editor/stock-providers";
import type { AutoClipAiConfig, BrollProviderId } from "@/lib/autoclip-ai/config";

export type BrollSourceId = BrollProviderId | "ai_image" | "ai_video";

export interface BrollCandidate {
  provider: BrollSourceId;
  /** Unique within the provider — the dedupe and no-reuse key. */
  externalId: string;
  /** A still the ranker looks at: an https URL, or a local file path. */
  preview: { url: string } | { path: string };
  /** What the renderer downloads. Our own bucket's URLs are presigned at render time. */
  downloadUrl: string;
  width: number;
  height: number;
  durationSec: number;
  attribution?: string;
  /** Precomputed image embedding (the user's library). */
  embedding?: number[];
  /** A shot elsewhere in this same source, in source seconds ("source" provider). */
  sourceWindow?: { startSec: number; endSec: number };
}

export interface BrollQuery {
  query: string;
  orientation: StockOrientation;
  perPage: number;
}

export function orientationFor(aspect: string): StockOrientation {
  return aspect === "16:9" ? "landscape" : aspect === "1:1" ? "square" : "portrait";
}

/** Shortest insert worth having; anything shorter loops visibly. */
const MIN_CANDIDATE_SEC = 1.5;
const SEARCH_CACHE_SEC = 24 * 60 * 60;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* cache is best-effort */ }
  const value = await load();
  try { await redis.set(key, JSON.stringify(value), "EX", SEARCH_CACHE_SEC); } catch { /* best-effort */ }
  return value;
}

const cacheKey = (provider: string, q: BrollQuery) =>
  `broll:search:${provider}:${q.orientation}:${q.perPage}:${q.query.toLowerCase().trim().slice(0, 80)}`;

// ── Pexels ───────────────────────────────────────────────────────────────────

async function searchPexels(q: BrollQuery): Promise<BrollCandidate[]> {
  if (!env.PEXELS_API_KEY) return [];
  return cached(cacheKey("pexels", q), async () => {
    const items = await searchStockVideos(q.query, 1, q.orientation, q.perPage);
    return items.map((v) => ({
      provider: "pexels" as const,
      externalId: v.id,
      preview: { url: v.thumbUrl },
      downloadUrl: v.downloadUrl,
      width: v.width ?? 0,
      height: v.height ?? 0,
      durationSec: v.durationSec ?? 0,
      attribution: v.attribution,
    }));
  });
}

// ── Pixabay ──────────────────────────────────────────────────────────────────
// https://pixabay.com/api/docs/#api_search_videos — their terms ask for search
// results to be cached (24h, done above) and for media not to be hotlinked
// permanently; AutoClip downloads each insert at render time, so it never is.

interface PixabayRendition { url: string; width: number; height: number; thumbnail?: string }
interface PixabayHit {
  id: number; duration: number; user: string;
  videos: { large?: PixabayRendition; medium?: PixabayRendition; small?: PixabayRendition; tiny?: PixabayRendition };
}

export function mapPixabayHits(hits: PixabayHit[]): BrollCandidate[] {
  return hits.flatMap((h) => {
    // ~720-1080p, the same target the Pexels mapper uses.
    const r = h.videos.medium ?? h.videos.large ?? h.videos.small;
    if (!r?.url) return [];
    const thumb = h.videos.medium?.thumbnail ?? h.videos.small?.thumbnail ?? h.videos.tiny?.thumbnail;
    if (!thumb) return [];
    return [{
      provider: "pixabay" as const,
      externalId: String(h.id),
      preview: { url: thumb },
      downloadUrl: r.url,
      width: r.width,
      height: r.height,
      durationSec: h.duration,
      attribution: `Video by ${h.user} on Pixabay`,
    }];
  });
}

async function searchPixabay(q: BrollQuery): Promise<BrollCandidate[]> {
  const key = env.PIXABAY_API_KEY;
  if (!key) return [];
  return cached(cacheKey("pixabay", q), async () => {
    // Pixabay has no orientation filter for video; the ranker sees the
    // dimensions, and the splice cover-scales whatever it gets.
    const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q.query.slice(0, 100))}` +
      `&per_page=${Math.min(50, Math.max(3, q.perPage))}&safesearch=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.api) });
    if (!res.ok) throw new Error(`Pixabay video search failed (${res.status})`);
    const data = await res.json() as { hits?: PixabayHit[] };
    return mapPixabayHits(data.hits ?? []);
  });
}

// ── Coverr ───────────────────────────────────────────────────────────────────
// Off by default in Config: their API access terms should be confirmed before
// it is switched on. Response shape per their public API docs.

interface CoverrHit {
  id: string; title?: string; duration?: number; poster?: string; thumbnail?: string;
  max_width?: number; max_height?: number; aspect_ratio?: string;
  urls?: { mp4?: string; mp4_download?: string; mp4_preview?: string };
}

export function mapCoverrHits(hits: CoverrHit[]): BrollCandidate[] {
  return hits.flatMap((h) => {
    const dl = h.urls?.mp4_download ?? h.urls?.mp4;
    const preview = h.thumbnail ?? h.poster;
    if (!dl || !preview) return [];
    return [{
      provider: "coverr" as const,
      externalId: String(h.id),
      preview: { url: preview },
      downloadUrl: dl,
      width: h.max_width ?? 0,
      height: h.max_height ?? 0,
      durationSec: h.duration ?? 0,
      attribution: "Video from Coverr",
    }];
  });
}

async function searchCoverr(q: BrollQuery): Promise<BrollCandidate[]> {
  const key = env.COVERR_API_KEY;
  if (!key) return [];
  return cached(cacheKey("coverr", q), async () => {
    const url = `https://api.coverr.co/videos?query=${encodeURIComponent(q.query.slice(0, 100))}&page_size=${Math.min(25, q.perPage)}&urls=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT.api),
    });
    if (!res.ok) throw new Error(`Coverr video search failed (${res.status})`);
    const data = await res.json() as { hits?: CoverrHit[] };
    return mapCoverrHits(data.hits ?? []);
  });
}

// ── Giphy (reaction inserts only) ────────────────────────────────────────────

async function searchGiphyReactions(q: BrollQuery): Promise<BrollCandidate[]> {
  const key = env.GIPHY_API_KEY;
  if (!key) return [];
  return cached(cacheKey("giphy", q), async () => {
    const gf = new GiphyFetch(key);
    const { data } = await gf.search(q.query.slice(0, 50), { type: "gifs", limit: Math.min(10, q.perPage), rating: "pg-13" });
    return data.flatMap((g) => {
      const mp4 = g.images.original?.mp4;
      const still = g.images.original_still?.url ?? g.images.downsized_still?.url;
      const h = Number(g.images.original?.height ?? 0);
      // A reaction is a short cutaway, but a 200px GIF upscaled to 1920 tall
      // looks broken — keep only the ones with some resolution.
      if (!mp4 || !still || h < 270) return [];
      return [{
        provider: "giphy" as const,
        externalId: String(g.id),
        preview: { url: still },
        downloadUrl: mp4,
        width: Number(g.images.original?.width ?? 0),
        height: h,
        durationSec: 2,
        attribution: "Via GIPHY",
      }];
    });
  });
}

// ── The creator's own library ────────────────────────────────────────────────

export interface LibraryAssetRow {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailS3Key: string | null;
  aiEmbedding: unknown;
  aiEmbeddingModel: string | null;
}

/** Video assets eligible as B-roll for this user, newest first. */
export async function loadLibraryAssets(userId: string, excludeAssetId: string | null, limit = 200): Promise<LibraryAssetRow[]> {
  return prisma.asset.findMany({
    where: {
      userId,
      kind: "video",
      archivedAt: null,
      thumbnailS3Key: { not: null },
      moderationStatus: { not: "flagged" },
      duration: { gte: MIN_CANDIDATE_SEC },
      ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, url: true, width: true, height: true, duration: true, thumbnailS3Key: true, aiEmbedding: true, aiEmbeddingModel: true },
  });
}

export function libraryCandidates(rows: LibraryAssetRow[], model: string): BrollCandidate[] {
  return rows.flatMap((a) => {
    const emb = Array.isArray(a.aiEmbedding) && a.aiEmbeddingModel === model ? (a.aiEmbedding as number[]) : null;
    if (!emb || !a.thumbnailS3Key) return [];
    return [{
      provider: "library" as const,
      externalId: a.id,
      preview: { url: `s3key:${a.thumbnailS3Key}` },
      downloadUrl: a.url,
      width: a.width ?? 0,
      height: a.height ?? 0,
      durationSec: a.duration ?? 0,
      embedding: emb,
    }];
  });
}

// ── Fan-out ──────────────────────────────────────────────────────────────────

type Searcher = (q: BrollQuery) => Promise<BrollCandidate[]>;
const STOCK_SEARCHERS: Partial<Record<BrollProviderId, Searcher>> = {
  pexels: searchPexels,
  pixabay: searchPixabay,
  coverr: searchCoverr,
};

const PROVIDER_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

/**
 * Search every enabled stock provider for every query, in parallel, and
 * return the deduplicated pool. `reaction` searches Giphy instead.
 */
export async function searchStockPool(args: {
  queries: string[];
  aspect: string;
  reaction: boolean;
  cfg: AutoClipAiConfig;
}): Promise<BrollCandidate[]> {
  const orientation = orientationFor(args.aspect);
  const perPage = args.cfg.broll.candidatesPerProvider;
  const jobs: Promise<BrollCandidate[]>[] = [];
  for (const query of args.queries.slice(0, 3)) {
    const q: BrollQuery = { query, orientation, perPage };
    if (args.reaction) {
      if (args.cfg.broll.providers.giphy) jobs.push(guard("giphy", searchGiphyReactions, q));
      continue;
    }
    for (const [id, search] of Object.entries(STOCK_SEARCHERS) as [BrollProviderId, Searcher][]) {
      if (args.cfg.broll.providers[id]) jobs.push(guard(id, search, q));
    }
  }
  const pools = await Promise.all(jobs);
  return dedupeCandidates(pools.flat()).filter((c) => c.durationSec === 0 || c.durationSec >= MIN_CANDIDATE_SEC || c.provider === "giphy");
}

function guard(id: string, search: Searcher, q: BrollQuery): Promise<BrollCandidate[]> {
  return withTimeout(
    search(q).catch((err) => {
      if (!(err instanceof StockNotConfiguredError)) logger.warn("autoclip-ai", `B-roll provider ${id} failed for "${q.query}"`, err);
      return [] as BrollCandidate[];
    }),
    PROVIDER_TIMEOUT_MS,
    [],
  );
}

export function dedupeCandidates(cands: BrollCandidate[]): BrollCandidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const k = `${c.provider}:${c.externalId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
