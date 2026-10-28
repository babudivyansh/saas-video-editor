"use client";

// Media library panel: every asset the user has uploaded (video/image/audio),
// with an upload button, search, sort, and a kind filter. Clicking an item
// adds it to the matching track (video → video track, image → image overlay
// track, audio → audio track). Stock content lives in the separate Image/
// Video/Audio tabs.

import React, { useEffect, useRef, useState } from "react";
import { Music2, UploadCloud } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import {
  type AssetRow,
  type SortKind,
  fmtDuration,
  searchAssets,
  useAssets,
  useUpload,
} from "./shared/assetData";
import { Button, PillGroup, SelectField } from "../ui";
import AssetCard from "./shared/AssetCard";
import { addAssetToTimeline } from "./shared/addAssetToTimeline";
import SearchField from "./shared/SearchField";
import PanelStatus from "./shared/PanelStatus";

const FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "video" as const, label: "Video" },
  { key: "image" as const, label: "Image" },
  { key: "audio" as const, label: "Audio" },
];

const SORTS: { key: SortKind; label: string }[] = [
  { key: "date", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
];

/** `kind` locks the panel to one media type (Audio › Your audio uses "audio"). */
export default function MediaPanel({ kind }: { kind?: "audio" } = {}) {
  const [pickedFilter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const filter = kind ?? pickedFilter;
  const [sort, setSort] = useState<SortKind>("date");
  const [query, setQuery] = useState("");
  const { assets, loading, refresh, loadMore, hasMore } = useAssets(kind ?? "all", { sort });
  const { upload, uploading, error } = useUpload(refresh);
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<string | null>(null);

  // Live search — kept out of the shared asset cache (see assetData.ts) so a
  // search-in-progress here never overwrites what TimelineTrack/PreviewStage
  // see when they look assets up by id.
  const [searchResults, setSearchResults] = useState<AssetRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { assets: rows } = await searchAssets(kind ?? "all", { q, sort });
      if (requestId.current === id) {
        setSearchResults(rows);
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, sort, kind]);

  const isSearching = query.trim().length > 0;
  const pool = isSearching ? (searchResults ?? []) : assets;
  const shown = filter === "all" ? pool : pool.filter((a) => a.kind === filter);
  const isLoading = isSearching ? searching : loading;

  const addToTimeline = async (asset: AssetRow) => {
    setAdding(asset.id);
    try {
      await addAssetToTimeline(asset);
    } catch {
      // metadata probe failed — skip silently, the asset stays in the library
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <input
        ref={fileInput}
        type="file"
        accept={kind ? "audio/*" : "video/*,image/*,audio/*"}
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
        className={`editor-press flex h-20 flex-col items-center justify-center gap-1 rounded-editor-lg border-2 border-dashed border-editor-border-strong text-sm font-semibold text-editor-text-muted transition-colors hover:border-editor-accent hover:bg-editor-accent/5 hover:text-editor-accent disabled:opacity-50 cursor-pointer ${uploading ? "editor-thinking" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        <UploadCloud className="h-5 w-5" />
        {uploading ? "Uploading…" : kind ? "+ Upload audio" : "+ Upload media"}
        <span className="text-[10px] font-normal">{kind ? "MP3, WAV or M4A — drop a file here" : "video, image, or audio — drop a file here"}</span>
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <SearchField value={query} onChange={setQuery} placeholder={kind ? "Search your audio…" : "Search your media…"} />

      {!kind && <PillGroup options={FILTERS} value={filter} onChange={setFilter} layoutId="media-filter" />}
      <SelectField
        label="Sort"
        value={SORTS.find((s) => s.key === sort)!.label}
        options={SORTS.map((s) => s.label)}
        onChange={(label) => setSort(SORTS.find((s) => s.label === label)!.key)}
      />

      {isLoading ? (
        <PanelStatus state="loading" message="Loading library…" />
      ) : shown.length === 0 ? (
        <PanelStatus
          state="empty"
          icon={<UploadCloud className="h-5 w-5" />}
          message={isSearching ? "No matches. Try a different search." : kind ? "No audio yet. Upload a voiceover or song." : "Nothing here yet. Upload a file to get started."}
        />
      ) : (
        <div className="editor-stagger-grid grid grid-cols-2 gap-2">
          {shown.map((a) => (
            <AssetCard
              key={a.id}
              onClick={() => addToTimeline(a)}
              adding={adding === a.id}
              title={a.name}
              durationLabel={a.duration != null ? fmtDuration(a.duration) : undefined}
              thumb={
                a.kind === "video" ? (
                  <video src={a.url} preload="metadata" muted className="h-full w-full object-cover" />
                ) : a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-editor-md bg-editor-accent/15 text-editor-accent">
                    <Music2 className="h-4 w-4" />
                  </span>
                )
              }
            />
          ))}
        </div>
      )}

      {!isSearching && hasMore && !loading && (
        <Button variant="subtle" size="sm" onClick={loadMore} className="self-center">
          Load more
        </Button>
      )}
    </div>
  );
}
