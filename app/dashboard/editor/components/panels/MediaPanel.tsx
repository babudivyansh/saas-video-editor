"use client";

// Media library panel: every asset the user has uploaded (video/image/audio),
// with an upload button and a kind filter. Clicking an item adds it to the
// matching track (video → video track, image → image overlay track, audio →
// audio track). Stock content lives in the separate Image/Video/Audio tabs.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";

export interface AssetRow {
  id: string;
  name: string;
  url: string;
  kind: string;
  duration: number | null;
  mimeType: string;
}

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
type AssetKind = "video" | "audio" | "image" | "all";
const assetCache: Record<AssetKind, AssetRow[]> = { video: [], audio: [], image: [], all: [] };
const fetchedKinds = new Set<AssetKind>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function fetchAssets(kind: AssetKind) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/assets?kind=${kind}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    assetCache[kind] = data.assets ?? [];
  } catch {
    assetCache[kind] = [];
  }
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

export function useAssets(kind: AssetKind) {
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!fetchedKinds.has(kind));

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchAssets(kind);
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    if (fetchedKinds.has(kind)) setLoading(false);
    else refresh();
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return { assets: assetCache[kind], loading, refresh };
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

const FILTERS = [
  { id: "all" as const, label: "All" },
  { id: "video" as const, label: "Video" },
  { id: "image" as const, label: "Image" },
  { id: "audio" as const, label: "Audio" },
];

export default function MediaPanel() {
  const addVideoClip = useEditorStore((s) => s.addVideoClip);
  const addImageClip = useEditorStore((s) => s.addImageClip);
  const addAudioClip = useEditorStore((s) => s.addAudioClip);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { assets, loading, refresh } = useAssets("all");
  const { upload, uploading, error } = useUpload(refresh);
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const shown = filter === "all" ? assets : assets.filter((a) => a.kind === filter);

  const addToTimeline = async (asset: AssetRow) => {
    setAdding(asset.id);
    try {
      if (asset.kind === "video") {
        const duration = asset.duration ?? (await probeDuration(asset.url, "video"));
        const doc = useEditorStore.getState().doc;
        addVideoClip({
          type: "video",
          id: crypto.randomUUID(),
          assetId: asset.id,
          timelineStart: docDuration(doc) === 0 ? 0 : doc.tracks.video.length
            ? doc.tracks.video[doc.tracks.video.length - 1].timelineStart + doc.tracks.video[doc.tracks.video.length - 1].duration
            : 0,
          duration,
          srcIn: 0,
          volume: 1,
          muted: false,
        });
      } else if (asset.kind === "audio") {
        const duration = asset.duration ?? (await probeDuration(asset.url, "audio"));
        addAudioClip({
          type: "audio",
          id: crypto.randomUUID(),
          assetId: asset.id,
          timelineStart: useEditorStore.getState().currentTime,
          duration,
          srcIn: 0,
          volume: 0.5,
        });
      } else {
        addImageClip({
          type: "image",
          id: crypto.randomUUID(),
          assetId: asset.id,
          timelineStart: useEditorStore.getState().currentTime,
          duration: 4,
          x: 0.5,
          y: 0.5,
          scalePct: 1,
          opacity: 1,
        });
      }
    } catch {
      // metadata probe failed — skip silently, the asset stays in the library
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <input
        ref={fileInput}
        type="file"
        accept="video/*,image/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-700 text-sm font-semibold text-zinc-400 transition-colors hover:border-violet-500 hover:text-violet-400 disabled:opacity-50 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        {uploading ? "Uploading…" : "+ Upload media"}
        <span className="text-[10px] font-normal">video, image, or audio — drop a file here</span>
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
              filter === f.id ? "bg-violet-600/15 text-violet-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="p-2 text-xs text-zinc-500">Loading library…</p>
      ) : shown.length === 0 ? (
        <p className="p-2 text-xs text-zinc-500">Nothing here yet. Upload a file to get started.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((a) => (
            <button
              key={a.id}
              onClick={() => addToTimeline(a)}
              disabled={adding === a.id}
              title={`Add "${a.name}" to timeline`}
              className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-left transition-all hover:border-violet-500 disabled:opacity-50 cursor-pointer"
            >
              <div className="relative flex aspect-video items-center justify-center bg-black">
                {a.kind === "video" && (
                  <video src={a.url} preload="metadata" muted className="h-full w-full object-cover" />
                )}
                {a.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                )}
                {a.kind === "audio" && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15 text-violet-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                      <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="6.5" cy="18" r="2.5" />
                      <circle cx="16.5" cy="16" r="2.5" />
                    </svg>
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                  {adding === a.id ? "Adding…" : "+ Add"}
                </span>
                {a.duration != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-zinc-100">
                    {fmtDuration(a.duration)}
                  </span>
                )}
              </div>
              <p className="truncate px-1.5 py-1 text-[10px] font-medium text-zinc-300">{a.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
