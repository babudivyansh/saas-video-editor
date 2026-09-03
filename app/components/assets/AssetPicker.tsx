"use client";

// Shared Global Asset Library picker — "Upload new" or "Choose from Assets",
// usable from any feature that accepts media. Built entirely from existing
// design-system primitives (Modal, Input, Dropdown, EmptyState, SkeletonGrid,
// Button) so it reads as native Clipiro UI, not a bolted-on dialog.

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Input } from "@/app/components/ui/Field";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { SkeletonGrid } from "@/app/components/ui/Skeleton";
import { Button } from "@/app/components/ui/Button";
import {
  listPickerAssets,
  uploadPickerAsset,
  fmtDuration,
  fmtSize,
  trackAssetEvent,
  AssetUploadError,
  type PickerAsset,
  type PickerKind,
  type PickerSort,
} from "./assetPickerData";

const KIND_LABEL: Record<PickerKind, string> = { all: "All", video: "Videos", image: "Images", audio: "Audio" };
const SORT_LABEL: Record<PickerSort, string> = { date: "Newest", oldest: "Oldest", name: "Name", size: "Largest" };
const KIND_ACCEPT: Record<PickerKind, string> = {
  all: "video/*,image/*,audio/*",
  video: "video/*",
  image: "image/*",
  audio: "audio/*",
};

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="2.5" y="5.5" width="14" height="13" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 10l5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="3" y="3" width="18" height="18" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KindTile({ kind }: { kind: PickerAsset["kind"] }) {
  const icon = kind === "video" ? <VideoIcon /> : kind === "audio" ? <AudioIcon /> : <ImageIcon />;
  return <div className="w-full h-full flex items-center justify-center text-ink-soft/60">{icon}</div>;
}

function AssetTile({ asset, onSelect }: { asset: PickerAsset; onSelect: (a: PickerAsset) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      className="group flex flex-col rounded-[var(--radius-card)] border border-card-border bg-panel overflow-hidden text-left transition-all hover:shadow-card-hover hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="relative aspect-video bg-tint-blue overflow-hidden">
        {asset.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt="" className="w-full h-full object-cover" />
        ) : asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <KindTile kind={asset.kind} />
        )}
        {asset.duration != null && (
          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-semibold text-white bg-black/60 rounded-md px-1.5 py-0.5">
            {fmtDuration(asset.duration)}
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 min-w-0">
        <p className="text-xs font-semibold text-ink truncate">{asset.name}</p>
        <p className="text-[11px] text-ink-soft mt-0.5">{fmtSize(asset.size)}</p>
      </div>
    </button>
  );
}

export interface AssetPickerProps {
  open: boolean;
  onClose: () => void;
  /** Media kinds this call site can use. ["all"] (or a mix) shows a kind
   *  filter row; a single concrete kind hides it — there's nothing to filter. */
  accept: PickerKind[];
  onSelect: (asset: PickerAsset) => void;
  title?: string;
}

export function AssetPicker({ open, onClose, accept, onSelect, title = "Choose media" }: AssetPickerProps) {
  const kindOptions: PickerKind[] = accept.includes("all") ? ["all", "video", "image", "audio"] : accept;
  const showKindFilter = kindOptions.length > 1;
  const [activeKind, setActiveKind] = useState<PickerKind>(accept.includes("all") ? "all" : accept[0]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PickerSort>("date");
  const [assets, setAssets] = useState<PickerAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<{ message: string; isLimitError: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { assets: rows, nextCursor } = await listPickerAssets({ kind: activeKind, q: query, sort });
      setAssets(rows);
      setCursor(nextCursor);
    } catch (e) {
      // Previously a failed list silently rendered as "no assets", which reads
      // as "you have nothing" rather than "we couldn't load anything".
      setLoadError(e instanceof Error ? e.message : "Couldn't load your assets");
      setAssets([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [activeKind, query, sort]);

  useEffect(() => {
    if (!open) return;
    load();
    trackAssetEvent("asset_picker_opened", { accept: accept.join(",") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  // Reset transient state whenever the picker is reopened for a fresh pick.
  useEffect(() => {
    if (open) return;
    setUploadError(null);
    setLoadError(null);
    setQueryInput("");
    setQuery("");
  }, [open]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { assets: rows, nextCursor } = await listPickerAssets({ kind: activeKind, q: query, sort, cursor });
      setAssets((prev) => [...prev, ...rows]);
      setCursor(nextCursor);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load more assets");
    } finally {
      setLoadingMore(false);
    }
  }

  function handleTileSelect(asset: PickerAsset) {
    trackAssetEvent("asset_selected", { assetId: asset.id, kind: asset.kind });
    onSelect(asset);
  }

  async function handleFileChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const asset = await uploadPickerAsset(file);
      // Matches spec: an upload inside the picker auto-selects and continues
      // the calling feature's workflow — no separate "now go find it" step.
      onSelect(asset);
    } catch (e) {
      const isLimitError = e instanceof AssetUploadError && e.isLimitError;
      setUploadError({ message: e instanceof Error ? e.message : "Upload failed", isLimitError });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} variant="drawer" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 min-w-0">
            <Input
              type="search"
              placeholder="Search by name…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search assets"
            />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Dropdown
              trigger={({ toggle }) => (
                <Button variant="secondary" size="sm" onClick={toggle} icon={<ChevronIcon />}>
                  {SORT_LABEL[sort]}
                </Button>
              )}
              align="right"
            >
              {({ close }) => (
                <>
                  {(Object.keys(SORT_LABEL) as PickerSort[]).map((s) => (
                    <DropdownItem key={s} onClick={() => { setSort(s); close(); }}>
                      {SORT_LABEL[s]}
                    </DropdownItem>
                  ))}
                </>
              )}
            </Dropdown>
            <input
              ref={fileInputRef}
              type="file"
              accept={KIND_ACCEPT[accept.includes("all") ? "all" : accept[0]]}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChosen(f); }}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<UploadIcon />}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload new"}
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-tint-rose border border-rose-100 px-3.5 py-2.5">
            <p className="text-xs text-rose-700">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()} className="flex-shrink-0">
              Retry
            </Button>
          </div>
        )}

        {uploadError && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-tint-rose border border-rose-100 px-3.5 py-2.5">
            <p className="text-xs text-rose-700">{uploadError.message}</p>
            {uploadError.isLimitError && (
              <Button variant="secondary" size="sm" href="/pricing" className="flex-shrink-0">Upgrade</Button>
            )}
          </div>
        )}

        {showKindFilter && (
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter by media type">
            {kindOptions.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={activeKind === k}
                onClick={() => setActiveKind(k)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                  activeKind === k ? "grad-brand text-on-primary" : "bg-surface text-ink-soft hover:text-ink border border-card-border"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[16rem]">
          {loading ? (
            <SkeletonGrid count={8} />
          ) : assets.length === 0 ? (
            <EmptyState
              icon={<UploadIcon />}
              title={query ? "No matching assets" : "Your media library is empty"}
              subtitle={
                query
                  ? "Try a different search or upload something new."
                  : "Upload a video, image, or audio file and it will automatically appear here for reuse across Clipiro."
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {assets.map((a) => (
                  <AssetTile key={a.id} asset={a} onSelect={handleTileSelect} />
                ))}
              </div>
              {cursor && (
                <div className="flex justify-center mt-4">
                  <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
