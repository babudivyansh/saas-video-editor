"use client";

// Stock music (Jamendo, CC-licensed). Adding a track imports it as an owned
// Asset, then drops it on the audio track at the playhead.

import React, { useState } from "react";
import { Music2, Search } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { fmtDuration } from "./shared/assetData";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";
import { Button } from "../ui";
import AssetCard from "./shared/AssetCard";
import SearchField from "./shared/SearchField";
import PanelStatus from "./shared/PanelStatus";

export default function StockAudioPanel() {
  const addAudioClip = useEditorStore((s) => s.addAudioClip);
  const { query, setQuery, items, loading, error, hasMore, loadMore } = useStockSearch("audio");
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
      <SearchField value={query} onChange={setQuery} placeholder="Search stock music…" />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <PanelStatus state="empty" icon={<Search className="h-5 w-5" />} message="Search CC-licensed music — powered by Jamendo." />
      )}
      {loading && items.length === 0 && <PanelStatus state="loading" message="Searching…" />}

      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <AssetCard
              key={item.id}
              layout="row"
              onClick={() => add(item)}
              adding={adding === item.id}
              attribution={item.attribution}
              title={item.name}
              durationLabel={fmtDuration(item.durationSec ?? null)}
              thumb={
                item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-editor-accent/15 text-editor-accent">
                    <Music2 className="h-4 w-4" />
                  </span>
                )
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
