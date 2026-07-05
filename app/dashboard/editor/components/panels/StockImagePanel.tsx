"use client";

// Stock images (Pexels). Adding one imports it as an owned Asset, then drops
// a full-frame image overlay clip at the playhead.

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";

export default function StockImagePanel() {
  const addImageClip = useEditorStore((s) => s.addImageClip);
  const { query, setQuery, items, loading, error } = useStockSearch("image");
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (item: StockItem) => {
    setAdding(item.id);
    try {
      const asset = await importStockItem(item, "image");
      if (!asset) return;
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
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search stock photos…"
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <p className="p-2 text-xs text-zinc-500">Search for photos — powered by Pexels.</p>
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
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
