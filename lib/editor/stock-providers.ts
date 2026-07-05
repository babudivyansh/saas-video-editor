// Server-only stock content search. Each provider needs its own API key in
// .env — callers get a clear "not configured" error when a key is missing so
// the UI can show that instead of a confusing fetch failure.
//
//   PEXELS_API_KEY   — stock photos + stock video (pexels.com/api)
//   JAMENDO_CLIENT_ID — stock/CC-licensed music (developer.jamendo.com)
//   GIPHY_API_KEY    — stickers, via the official @giphy/js-fetch-api SDK
//                       (the SDK still requires this key — it's a thin client
//                       over the same REST API, not a keyless alternative)
//
// Giphy stickers are imported as their static "still" rendition, not the
// animated GIF — keeps the render pipeline's image track uniform (a single
// still frame per clip) instead of needing a second, animated-overlay path.

import { GiphyFetch } from "@giphy/js-fetch-api";

export interface StockItem {
  id: string;
  name: string;
  thumbUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationSec?: number; // video/audio only
  attribution: string; // required by most free-tier stock APIs' display terms
}

export class StockNotConfiguredError extends Error {
  constructor(provider: string, envVar: string) {
    super(`${provider} is not configured (missing ${envVar})`);
  }
}

export async function searchStockImages(query: string, page = 1): Promise<StockItem[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new StockNotConfiguredError("Stock images", "PEXELS_API_KEY");

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24&page=${page}`,
    { headers: { Authorization: key } },
  );
  if (!res.ok) throw new Error(`Pexels image search failed (${res.status})`);
  const data = await res.json();

  return (data.photos ?? []).map((p: {
    id: number; photographer: string; width: number; height: number;
    src: { large: string; medium: string; original: string };
  }) => ({
    id: String(p.id),
    name: `Photo by ${p.photographer}`,
    thumbUrl: p.src.medium,
    downloadUrl: p.src.large,
    width: p.width,
    height: p.height,
    attribution: `Photo by ${p.photographer} on Pexels`,
  }));
}

export async function searchStockVideos(query: string, page = 1): Promise<StockItem[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new StockNotConfiguredError("Stock video", "PEXELS_API_KEY");

  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=24&page=${page}`,
    { headers: { Authorization: key } },
  );
  if (!res.ok) throw new Error(`Pexels video search failed (${res.status})`);
  const data = await res.json();

  return (data.videos ?? []).map((v: {
    id: number; user: { name: string }; duration: number; width: number; height: number;
    image: string; video_files: { link: string; quality: string; height: number | null }[];
  }) => {
    // Prefer a moderate resolution (~720p) file over the largest — keeps
    // download/import time and storage down for a background clip.
    const files = [...v.video_files].sort((a, b) => (a.height ?? 9999) - (b.height ?? 9999));
    const file = files.find((f) => (f.height ?? 0) >= 480 && (f.height ?? 0) <= 1080) ?? files[files.length - 1];
    return {
      id: String(v.id),
      name: `Video by ${v.user.name}`,
      thumbUrl: v.image,
      downloadUrl: file.link,
      width: v.width,
      height: v.height,
      durationSec: v.duration,
      attribution: `Video by ${v.user.name} on Pexels`,
    };
  });
}

export async function searchStockAudio(query: string, page = 1): Promise<StockItem[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new StockNotConfiguredError("Stock audio", "JAMENDO_CLIENT_ID");

  const offset = (page - 1) * 24;
  const res = await fetch(
    `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=24&offset=${offset}` +
      `&search=${encodeURIComponent(query)}&audioformat=mp32`,
  );
  if (!res.ok) throw new Error(`Jamendo search failed (${res.status})`);
  const data = await res.json();

  return (data.results ?? []).map((t: {
    id: string; name: string; artist_name: string; duration: number; image: string; audio: string;
  }) => ({
    id: t.id,
    name: `${t.name} — ${t.artist_name}`,
    thumbUrl: t.image,
    downloadUrl: t.audio,
    durationSec: t.duration,
    attribution: `"${t.name}" by ${t.artist_name} via Jamendo`,
  }));
}

export async function searchStockStickers(query: string, page = 1): Promise<StockItem[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new StockNotConfiguredError("Stickers", "GIPHY_API_KEY");

  const gf = new GiphyFetch(key);
  const offset = (page - 1) * 24;
  const { data } = await gf.search(query, { type: "stickers", limit: 24, offset });

  return data.map((s) => ({
    id: String(s.id),
    name: s.title || "Sticker",
    thumbUrl: s.images.fixed_width_still.url,
    downloadUrl: s.images.original_still.url,
    width: s.images.fixed_width_still.width,
    height: s.images.fixed_width_still.height,
    attribution: "Sticker via GIPHY",
  }));
}

// Decorative animated GIFs (not imported as assets) — used to give the
// Effect/Transition preset buttons a looping preview instead of plain text.
// Same GIPHY_API_KEY as stickers, just the regular "gifs" type instead of
// "stickers".
export async function searchStockGifs(query: string, limit = 1): Promise<StockItem[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new StockNotConfiguredError("Preset preview", "GIPHY_API_KEY");

  const gf = new GiphyFetch(key);
  const { data } = await gf.search(query, { type: "gifs", limit });

  return data.map((g) => ({
    id: String(g.id),
    name: g.title || "GIF",
    thumbUrl: g.images.fixed_width_small?.url ?? g.images.fixed_width.url,
    downloadUrl: g.images.original.url,
    width: g.images.fixed_width.width,
    height: g.images.fixed_width.height,
    attribution: "via GIPHY",
  }));
}
