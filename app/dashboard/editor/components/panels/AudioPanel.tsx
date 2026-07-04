"use client";

// Audio panel: the user's audio assets + upload; clicking adds a music clip
// to the audio track starting at the playhead.

import React, { useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useAssets, useUpload, probeDuration, type AssetRow } from "./MediaPanel";

function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioPanel() {
  const addAudioClip = useEditorStore((s) => s.addAudioClip);
  const { assets, loading, refresh } = useAssets("audio");
  const { upload, uploading, error } = useUpload(refresh);
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (asset: AssetRow) => {
    setAdding(asset.id);
    try {
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
    } catch {
      // probe failed — leave asset in library
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
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
        className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-card-border text-sm font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-50 cursor-pointer"
      >
        {uploading ? "Uploading…" : "+ Upload audio"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="p-2 text-xs text-ink-soft">Loading library…</p>
      ) : assets.length === 0 ? (
        <p className="p-2 text-xs text-ink-soft">No audio yet. Upload music or a voice track.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assets.map((a) => (
            <button
              key={a.id}
              onClick={() => add(a)}
              disabled={adding === a.id}
              className="flex items-center gap-2.5 rounded-lg border border-card-border bg-white px-2.5 py-2 text-left transition-all hover:border-brand cursor-pointer disabled:opacity-50"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                  <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="6.5" cy="18" r="2.5" />
                  <circle cx="16.5" cy="16" r="2.5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{a.name}</span>
                <span className="text-[10px] text-ink-soft">{adding === a.id ? "Adding…" : fmtDuration(a.duration)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
