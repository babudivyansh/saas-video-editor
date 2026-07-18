"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { SkeletonGrid } from "@/app/components/ui/Skeleton";
import { AssetCard } from "./AssetCard";
import type { Asset } from "../types";

function useColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      setColumns(w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return columns;
}

interface AssetGridProps {
  assets: Asset[];
  loading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  selectedIds: Set<string>;
  selectionActive: boolean;
  onSelect: (asset: Asset, e: React.MouseEvent) => void;
  onOpenPreview: (asset: Asset) => void;
  renamingId: string | null;
  renameVal: string;
  onRenameStart: (asset: Asset) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleFavorite: (asset: Asset) => void;
  onCopyUrl: (url: string) => void;
  onContextMenu: (e: React.MouseEvent, asset: Asset) => void;
  onDragStartAsset: (e: React.DragEvent, asset: Asset) => void;
  emptyTitle: string;
  emptySubtitle: string;
  emptyAction?: { label: string; onClick: () => void };
}

export function AssetGrid({
  assets, loading, hasNextPage, isFetchingNextPage, onLoadMore,
  selectedIds, selectionActive, onSelect, onOpenPreview,
  renamingId, renameVal, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
  onToggleFavorite, onCopyUrl, onContextMenu, onDragStartAsset,
  emptyTitle, emptySubtitle, emptyAction,
}: AssetGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(parentRef);

  const rows = useMemo(() => {
    const out: Asset[][] = [];
    for (let i = 0; i < assets.length; i += columns) out.push(assets.slice(i, i + columns));
    return out;
  }, [assets, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 224,
    overscan: 3,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (lastIndex !== undefined && lastIndex >= rows.length - 3 && hasNextPage && !isFetchingNextPage) {
      onLoadMore();
    }
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  if (loading) return <SkeletonGrid />;
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
          </svg>
        }
        title={emptyTitle}
        subtitle={emptySubtitle}
        action={emptyAction}
      />
    );
  }

  return (
    <div ref={parentRef} className="h-[calc(100vh-340px)] min-h-[400px] overflow-y-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: "1rem",
              paddingBottom: "1rem",
            }}
          >
            {rows[virtualRow.index].map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selectedIds.has(asset.id)}
                selectionActive={selectionActive}
                isRenaming={renamingId === asset.id}
                renameVal={renameVal}
                onSelect={(e) => onSelect(asset, e)}
                onOpenPreview={() => onOpenPreview(asset)}
                onRenameStart={() => onRenameStart(asset)}
                onRenameChange={onRenameChange}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                onToggleFavorite={() => onToggleFavorite(asset)}
                onCopyUrl={() => onCopyUrl(asset.url)}
                onContextMenu={(e) => onContextMenu(e, asset)}
                onDragStartAsset={(e) => onDragStartAsset(e, asset)}
              />
            ))}
          </div>
        ))}
      </div>
      {isFetchingNextPage && <p className="text-center text-xs text-ink-soft py-3">Loading more…</p>}
    </div>
  );
}
