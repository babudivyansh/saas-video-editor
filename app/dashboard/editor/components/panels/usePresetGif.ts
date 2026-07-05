"use client";

// Decorative looping-GIF preview for Effect/Transition preset buttons (via
// GIPHY — the same key already used for stickers). Purely visual: these GIFs
// are never imported as assets, just rendered as a background loop so a
// preset like "Shake" or "Wipe" shows *something* instead of plain text.
// One fetch per query, shared across every panel instance/remount.

import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchPresetGif(query: string): Promise<string | null> {
  if (cache.has(query)) return cache.get(query) ?? null;
  if (inflight.has(query)) return inflight.get(query)!;

  const promise = (async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/editor/stock/search?type=gif&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const url: string | null = data.items?.[0]?.thumbUrl ?? null;
      cache.set(query, url);
      return url;
    } catch {
      cache.set(query, null);
      return null;
    } finally {
      inflight.delete(query);
    }
  })();

  inflight.set(query, promise);
  return promise;
}

export function usePresetGif(query: string): string | null {
  const [url, setUrl] = useState<string | null>(cache.get(query) ?? null);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(query)) {
      setUrl(cache.get(query) ?? null);
      return;
    }
    fetchPresetGif(query).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return url;
}
