"use client";

// Stock video clips (Pexels). Adding one imports it as an owned Asset, then
// appends it to the end of the video track — same placement rule as the
// Media panel's own uploads.

import React, { useState } from "react";
import { Search } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { fmtDuration } from "./shared/assetData";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";
import { Button } from "../ui";
import AssetCard from "./shared/AssetCard";
import SearchField from "./shared/SearchField";
import PanelStatus from "./shared/PanelStatus";

export default function StockVideoPanel() {
  const addVideoClip = useEditorStore((s) => s.addVideoClip);
  const { query, setQuery, items, loading, error, hasMore, loadMore } = useStockSearch("video");
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
      <SearchField value={query} onChange={setQuery} placeholder="Search stock video…" />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <PanelStatus state="empty" icon={<Search className="h-5 w-5" />} message="Search for video clips — powered by Pexels." />
      )}
      {loading && items.length === 0 && <PanelStatus state="loading" message="Searching…" />}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <AssetCard
              key={item.id}
              onClick={() => add(item)}
              adding={adding === item.id}
              attribution={item.attribution}
              durationLabel={item.durationSec != null ? fmtDuration(item.durationSec) : undefined}
              thumb={
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbUrl} alt={item.name} className="h-full w-full object-cover" />
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
