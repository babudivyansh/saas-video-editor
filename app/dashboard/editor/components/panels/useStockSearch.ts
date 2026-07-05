"use client";

// Shared search-box + debounce + import logic for the four stock panels
// (Image/Video/Audio/Sticker). Search hits our own /stock/search proxy;
// "add" hits /stock/import, which re-hosts the item as a normal Asset.

import { useEffect, useState } from "react";
import { registerAsset } from "./MediaPanel";

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

export function useStockSearch(type: "image" | "video" | "audio" | "sticker") {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            `/api/editor/stock/search?type=${type}&q=${encodeURIComponent(effectiveQuery)}`,
            { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
          );
          const data = await res.json();
          if (!res.ok) {
            setError(isDefault ? null : (data.error ?? "Search failed"));
            setItems([]);
          } else {
            setItems(data.items ?? []);
            setError(null);
          }
        } catch (e) {
          if (e instanceof Error && e.name !== "AbortError") {
            if (!isDefault) setError("Search failed");
          }
        } finally {
          setLoading(false);
        }
      },
      isDefault ? 0 : 400,
    );

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, type]);

  return { query, setQuery, items, loading, error };
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
