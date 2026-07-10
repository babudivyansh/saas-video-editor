"use client";

// Shared asset data layer — extracted from MediaPanel.tsx so it has one home
// importable by MediaPanel itself, the stock panels (useStockSearch.ts),
// TimelineTrack.tsx, and PreviewStage.tsx, none of which are UI.

import { useCallback, useEffect, useState } from "react";

export interface AssetRow {
  id: string;
  name: string;
  url: string;
  kind: string;
  duration: number | null;
  mimeType: string;
}

export type SortKind = "date" | "oldest" | "name" | "size";

/** Read a media file's duration client-side (uploads may lack metadata). */
export function probeDuration(url: string, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error("Could not read media metadata"));
    el.src = url;
  });
}

// Every useAssets(kind) call used to keep its own local copy of the asset
// list, fetched once on mount. That meant an asset created in one panel
// (e.g. a stock import) was invisible to every other panel/preview already
// mounted — PreviewStage would try to render it with an empty src until a
// full page reload. Keeping one cache per kind, shared across all callers,
// fixes that: registerAsset() lets any import/upload flow push a new asset
// straight into every relevant bucket without waiting on a refetch.
//
// The cache is keyed by `kind` ONLY — never by search query. A live search
// (`q`) is intentionally kept out of this shared cache/pub-sub (see
// searchAssets below): every other consumer (TimelineTrack, PreviewStage)
// does an id-lookup against assetCache[kind] expecting it to hold the full
// asset list for that kind, not whatever a user is currently typing into
// MediaPanel's search box. `sort` is safe to let touch the cache since
// nothing reads cache order, only does `.find(a => a.id === id)`.
type AssetKind = "video" | "audio" | "image" | "all";
const assetCache: Record<AssetKind, AssetRow[]> = { video: [], audio: [], image: [], all: [] };
const nextCursorCache: Record<AssetKind, string | null> = { video: null, audio: null, image: null, all: null };
const fetchedKinds = new Set<AssetKind>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Raw fetch against /api/assets — used both by the cache-backed fetchAssets
 *  below and directly by callers that want results without touching the
 *  shared cache (a live search). */
export async function searchAssets(
  kind: AssetKind,
  opts: { q?: string; sort?: SortKind; cursor?: string } = {},
): Promise<{ assets: AssetRow[]; nextCursor: string | null }> {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams({ kind, limit: "100" });
  if (opts.q) params.set("q", opts.q);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.cursor) params.set("cursor", opts.cursor);
  try {
    const res = await fetch(`/api/assets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { assets: data.assets ?? [], nextCursor: data.nextCursor ?? null };
  } catch {
    return { assets: [], nextCursor: null };
  }
}

async function fetchAssets(kind: AssetKind, opts: { sort?: SortKind; cursor?: string; append?: boolean } = {}) {
  const { assets: rows, nextCursor } = await searchAssets(kind, { sort: opts.sort, cursor: opts.cursor });
  assetCache[kind] = opts.append ? [...assetCache[kind], ...rows] : rows;
  nextCursorCache[kind] = nextCursor;
  fetchedKinds.add(kind);
  notify();
}

/** Push a freshly created asset (upload or stock import) into every cache
 *  bucket it belongs to, so already-mounted panels/preview pick it up
 *  immediately instead of showing a broken/missing asset until reload. */
export function registerAsset(asset: AssetRow) {
  const kinds: AssetKind[] = ["all"];
  if (asset.kind === "video" || asset.kind === "audio" || asset.kind === "image") kinds.push(asset.kind);
  for (const k of kinds) {
    if (!assetCache[k].some((a) => a.id === asset.id)) {
      assetCache[k] = [asset, ...assetCache[k]];
    }
  }
  notify();
}

export function useAssets(kind: AssetKind, opts: { sort?: SortKind } = {}) {
  const { sort } = opts;
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!fetchedKinds.has(kind));

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchAssets(kind, { sort });
    setLoading(false);
  }, [kind, sort]);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    if (fetchedKinds.has(kind) && !sort) setLoading(false);
    else refresh();
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, sort]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorCache[kind];
    if (!cursor) return;
    setLoading(true);
    await fetchAssets(kind, { sort, cursor, append: true });
    setLoading(false);
  }, [kind, sort]);

  return { assets: assetCache[kind], loading, refresh, loadMore, hasMore: nextCursorCache[kind] != null };
}

export function useUpload(onDone: () => void) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Upload failed");
        }
        if (data.asset) registerAsset(data.asset);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onDone],
  );

  return { upload, uploading, error };
}

export function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
