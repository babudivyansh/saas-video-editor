"use client";

// Stickers (Giphy, static stills). Adding one imports it as an owned image
// Asset, then drops a small centered overlay — same image track as photos,
// just smaller and meant to be dragged/resized in place.

import React, { useState } from "react";
import { Search } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";
import { Button } from "../ui";
import AssetCard from "./shared/AssetCard";
import SearchField from "./shared/SearchField";
import PanelStatus from "./shared/PanelStatus";

export default function StickerPanel() {
  const addImageClip = useEditorStore((s) => s.addImageClip);
  const { query, setQuery, items, loading, error, hasMore, loadMore } = useStockSearch("sticker");
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
      <SearchField value={query} onChange={setQuery} placeholder="Search stickers…" />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <PanelStatus
          state="empty"
          icon={<Search className="h-5 w-5" />}
          message="Search stickers — powered by GIPHY. Added as a static image."
        />
      )}
      {loading && items.length === 0 && <PanelStatus state="loading" message="Searching…" />}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <AssetCard
              key={item.id}
              aspect="square"
              onClick={() => add(item)}
              adding={adding === item.id}
              attribution={item.name}
              thumb={
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbUrl} alt={item.name} className="h-full w-full object-contain p-1" />
              }
            />
          ))}
        </div>
      )}

      {hasMore && (
        <Button variant="subtle" size="sm" onClick={loadMore} disabled={loading} className="self-center">
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
