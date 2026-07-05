"use client";

// Stock video clips (Pexels). Adding one imports it as an owned Asset, then
// appends it to the end of the video track — same placement rule as the
// Media panel's own uploads.

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";

function fmtDuration(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StockVideoPanel() {
  const addVideoClip = useEditorStore((s) => s.addVideoClip);
  const { query, setQuery, items, loading, error } = useStockSearch("video");
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (item: StockItem) => {
    setAdding(item.id);
    try {
      const asset = await importStockItem(item, "video");
      if (!asset) return;
      const doc = useEditorStore.getState().doc;
      const last = doc.tracks.video[doc.tracks.video.length - 1];
      addVideoClip({
        type: "video",
        id: crypto.randomUUID(),
        assetId: asset.id,
        timelineStart: docDuration(doc) === 0 ? 0 : last ? last.timelineStart + last.duration : 0,
        duration: asset.duration ?? item.durationSec ?? 5,
        srcIn: 0,
        volume: 1,
        muted: false,
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
        placeholder="Search stock video…"
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <p className="p-2 text-xs text-zinc-500">Search for video clips — powered by Pexels.</p>
      )}
      {loading && <p className="p-2 text-xs text-zinc-500">Searching…</p>}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => add(item)}
              disabled={adding === item.id}
              title={item.attribution}
              className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-left transition-all hover:border-violet-500 disabled:opacity-50 cursor-pointer"
            >
              <div className="relative flex aspect-video items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl} alt={item.name} className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                  {adding === item.id ? "Adding…" : "+ Add"}
                </span>
                {item.durationSec != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-zinc-100">
                    {fmtDuration(item.durationSec)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
