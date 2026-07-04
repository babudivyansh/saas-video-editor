"use client";

// Media library panel: lists the user's video assets, uploads new ones via
// the existing /api/upload route, and adds clips to the end of the video track.

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

export function useAssets(kind: "video" | "audio") {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/assets?kind=${kind}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { assets, loading, refresh };
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
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
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

function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MediaPanel() {
  const addVideoClip = useEditorStore((s) => s.addVideoClip);
  const { assets, loading, refresh } = useAssets("video");
  const { upload, uploading, error } = useUpload(refresh);
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const addToTimeline = async (asset: AssetRow) => {
    setAdding(asset.id);
    try {
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
        accept="video/*"
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
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-card-border text-sm font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-50 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith("video/")) upload(f);
        }}
      >
        {uploading ? "Uploading…" : "+ Upload video"}
        <span className="text-[10px] font-normal">or drop a file here</span>
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="p-2 text-xs text-ink-soft">Loading library…</p>
      ) : assets.length === 0 ? (
        <p className="p-2 text-xs text-ink-soft">No videos yet. Upload one to get started.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((a) => (
            <button
              key={a.id}
              onClick={() => addToTimeline(a)}
              disabled={adding === a.id}
              title={`Add "${a.name}" to timeline`}
              className="group overflow-hidden rounded-lg border border-card-border text-left transition-all hover:border-brand disabled:opacity-50 cursor-pointer"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gray-900">
                <video src={a.url} preload="metadata" muted className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                  {adding === a.id ? "Adding…" : "+ Add"}
                </span>
                {a.duration != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">
                    {fmtDuration(a.duration)}
                  </span>
                )}
              </div>
              <p className="truncate px-1.5 py-1 text-[10px] font-medium text-ink">{a.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
