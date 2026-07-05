"use client";

// Stickers (Giphy, static stills). Adding one imports it as an owned image
// Asset, then drops a small centered overlay — same image track as photos,
// just smaller and meant to be dragged/resized in place.

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";

export default function StickerPanel() {
  const addImageClip = useEditorStore((s) => s.addImageClip);
  const { query, setQuery, items, loading, error } = useStockSearch("sticker");
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
        scalePct: 0.3,
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
        placeholder="Search stickers…"
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <p className="p-2 text-xs text-zinc-500">Search stickers — powered by GIPHY. Added as a static image.</p>
      )}
      {loading && <p className="p-2 text-xs text-zinc-500">Searching…</p>}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => add(item)}
              disabled={adding === item.id}
              title={item.name}
              className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-all hover:border-violet-500 disabled:opacity-50 cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumbUrl} alt={item.name} className="h-full w-full object-contain p-1" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                {adding === item.id ? "…" : "+ Add"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
