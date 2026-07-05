"use client";

// Stock music (Jamendo, CC-licensed). Adding a track imports it as an owned
// Asset, then drops it on the audio track at the playhead.

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";

function fmtDuration(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StockAudioPanel() {
  const addAudioClip = useEditorStore((s) => s.addAudioClip);
  const { query, setQuery, items, loading, error } = useStockSearch("audio");
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (item: StockItem) => {
    setAdding(item.id);
    try {
      const asset = await importStockItem(item, "audio");
      if (!asset) return;
      addAudioClip({
        type: "audio",
        id: crypto.randomUUID(),
        assetId: asset.id,
        timelineStart: useEditorStore.getState().currentTime,
        duration: asset.duration ?? item.durationSec ?? 30,
        srcIn: 0,
        volume: 0.5,
      });
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search stock music…"
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <p className="p-2 text-xs text-zinc-500">Search CC-licensed music — powered by Jamendo.</p>
      )}
      {loading && <p className="p-2 text-xs text-zinc-500">Searching…</p>}

      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => add(item)}
              disabled={adding === item.id}
              title={item.attribution}
              className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-left transition-all hover:border-violet-500 cursor-pointer disabled:opacity-50"
            >
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600/15 text-violet-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                    <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6.5" cy="18" r="2.5" />
                    <circle cx="16.5" cy="16" r="2.5" />
                  </svg>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-zinc-200">{item.name}</span>
                <span className="text-[10px] text-zinc-500">
                  {adding === item.id ? "Adding…" : fmtDuration(item.durationSec)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
