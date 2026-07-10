"use client";

// Shared search-box + debounce + import logic for the four stock panels
// (Image/Video/Audio/Sticker). Search hits our own /stock/search proxy;
// "add" hits /stock/import, which re-hosts the item as a normal Asset.

import { useEffect, useState } from "react";
import { registerAsset } from "./shared/assetData";

export interface StockItem {
  id: string;
  name: string;
  thumbUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  attribution: string;
}

export interface ImportedAsset {
  id: string;
  name: string;
  url: string;
  kind: string;
  duration: number | null;
  mimeType: string;
}

// Shown before the user types anything, so each panel opens with content
// already in it instead of a blank search box.
const DEFAULT_QUERIES: Record<"image" | "video" | "audio" | "sticker", string> = {
  image: "nature",
  video: "nature",
  audio: "lofi",
  sticker: "reaction",
};

// Every provider (Pexels image/video, Jamendo audio, Giphy stickers) returns
// exactly this many items per page — used to infer hasMore without the
// providers exposing a total count.
const PAGE_SIZE = 24;

export function useStockSearch(type: "image" | "video" | "audio" | "sticker") {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Reset to page 1 whenever the query or type changes — a fresh search
  // always starts over, "load more" is the only way page advances.
  useEffect(() => {
    setPage(1);
  }, [query, type]);

  useEffect(() => {
    const trimmed = query.trim();
    const isDefault = !trimmed;
    const effectiveQuery = trimmed || DEFAULT_QUERIES[type];

    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(
            `/api/editor/stock/search?type=${type}&q=${encodeURIComponent(effectiveQuery)}&page=${page}`,
            { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
          );
          const data = await res.json();
          if (!res.ok) {
            // A "not configured" (missing API key) error is always shown,
            // even on the silent default query — otherwise the panel just
            // looks empty with no clue why. Other failures (rate limit,
            // network) stay suppressed on the default query so a normal
            // user isn't greeted with a scary error before they've typed
            // anything.
            setError(res.status === 503 || !isDefault ? (data.error ?? "Search failed") : null);
            if (page === 1) setItems([]);
            setHasMore(false);
          } else {
            const fetched: StockItem[] = data.items ?? [];
            setItems((prev) => (page === 1 ? fetched : [...prev, ...fetched]));
            setError(null);
            setHasMore(fetched.length >= PAGE_SIZE);
          }
        } catch (e) {
          if (e instanceof Error && e.name !== "AbortError") {
            if (!isDefault) setError("Search failed");
          }
        } finally {
          setLoading(false);
        }
      },
      // Only debounce a fresh (page 1) query — "load more" is a deliberate
      // click and should fetch immediately.
      page === 1 && !isDefault ? 400 : 0,
    );

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, type, page]);

  const loadMore = () => {
    if (!loading && hasMore) setPage((p) => p + 1);
  };

  return { query, setQuery, items, loading, error, hasMore, loadMore };
}

export async function importStockItem(
  item: StockItem,
  kind: "image" | "video" | "audio",
): Promise<ImportedAsset | null> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/editor/stock/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      downloadUrl: item.downloadUrl,
      kind,
      name: item.name,
      width: item.width,
      height: item.height,
      durationSec: item.durationSec,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const asset = data.asset as ImportedAsset;
  registerAsset(asset);
  return asset;
}
