"use client";

// Stock video clips (Pexels). Adding one imports it as an owned Asset, then
// appends it to the end of the video track — same placement rule as the
// Media panel's own uploads. "Save to Assets" imports without adding.
// Results default to the project's shape (portrait for 9:16, and so on);
// hovering a card plays a small preview straight from Pexels.

import React, { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, Plus, Search } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { docDimensions, type FixedAspect } from "@/lib/editor/types";
import { fmtDuration } from "./shared/assetData";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";
import { Button, showPanelToast } from "../ui";
import SearchField from "./shared/SearchField";
import { playUiSound } from "../../hooks/useUiSound";
import PanelStatus from "./shared/PanelStatus";

type Orientation = "portrait" | "square" | "landscape";
const ORIENTATION: Record<FixedAspect, Orientation> = {
  "9:16": "portrait",
  "1:1": "square",
  "16:9": "landscape",
  "4:5": "portrait",
};

/** An "original" frame has no preset, so search by its real shape. */
function orientationOf(frame: { w: number; h: number }): Orientation {
  const r = frame.w / frame.h;
  return r > 1.1 ? "landscape" : r < 0.9 ? "portrait" : "square";
}

const SHORT_SEC = 15;

const chip = (on: boolean) =>
  `rounded-editor-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
    on ? "border-editor-accent bg-editor-accent/15 text-editor-text" : "border-editor-border text-editor-text-muted hover:text-editor-text"
  }`;

export default function StockVideoPanel() {
  const aspect = useEditorStore((s) => s.doc.aspect);
  const orientation = useEditorStore((s) => (s.doc.aspect === "original" ? orientationOf(docDimensions(s.doc)) : ORIENTATION[s.doc.aspect]));
  const addVideoClip = useEditorStore((s) => s.addVideoClip);
  const [fitsShape, setFitsShape] = useState(true);
  const [shortOnly, setShortOnly] = useState(false);
  const { query, setQuery, items, loading, error, hasMore, loadMore } = useStockSearch("video", {
    orientation: fitsShape ? orientation : undefined,
  });
  const [busy, setBusy] = useState<{ id: string; action: "add" | "save" } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const shown = shortOnly ? items.filter((i) => (i.durationSec ?? 0) <= SHORT_SEC) : items;

  const add = async (item: StockItem) => {
    setBusy({ id: item.id, action: "add" });
    setFailed(null);
    try {
      const asset = await importStockItem(item, "video");
      if (!asset) {
        setFailed("Couldn't add that clip. Try another one.");
        return;
      }
      setSaved((s) => new Set(s).add(item.id));
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
      playUiSound("add");
      showPanelToast("Stock clip added to the video track");
    } finally {
      setBusy(null);
    }
  };

  const save = async (item: StockItem) => {
    setBusy({ id: item.id, action: "save" });
    setFailed(null);
    try {
      const asset = await importStockItem(item, "video");
      if (asset) setSaved((s) => new Set(s).add(item.id));
      else setFailed("Couldn't save that clip. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const tall = fitsShape && orientation === "portrait";

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <SearchField value={query} onChange={setQuery} placeholder="Search stock video…" />

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={fitsShape} onClick={() => setFitsShape(true)} className={chip(fitsShape)}>
          Fits {aspect}
        </button>
        <button type="button" aria-pressed={!fitsShape} onClick={() => setFitsShape(false)} className={chip(!fitsShape)}>
          Any shape
        </button>
        <button type="button" aria-pressed={shortOnly} onClick={() => setShortOnly((v) => !v)} className={chip(shortOnly)}>
          Under {SHORT_SEC} s
        </button>
        <span className="ml-auto text-[11px] text-editor-text-faint">from Pexels</span>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
      {failed && (
        <p role="alert" className="text-xs text-error">
          {failed}
        </p>
      )}
      {!error && shown.length === 0 && !loading && (
        <PanelStatus
          state="empty"
          icon={<Search className="h-5 w-5" />}
          message={items.length > 0 ? `No clips under ${SHORT_SEC} s here — try another search.` : "Search for video clips — powered by Pexels."}
        />
      )}
      {loading && items.length === 0 && <PanelStatus state="loading" message="Searching…" />}

      {shown.length > 0 && (
        <div className="editor-stagger-grid grid grid-cols-2 gap-2">
          {shown.map((item) => {
            const isBusy = busy?.id === item.id;
            const isSaved = saved.has(item.id);
            const previewing = hovered === item.id && item.previewUrl;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered((h) => (h === item.id ? null : h))}
                className={`group relative overflow-hidden rounded-editor-md border border-editor-border bg-black ${tall ? "aspect-[9/16]" : "aspect-video"}`}
              >
                <button
                  type="button"
                  onClick={() => add(item)}
                  onFocus={() => setHovered(item.id)}
                  disabled={busy !== null}
                  title={item.attribution}
                  aria-label={`Add ${item.name} to the timeline`}
                  className="absolute inset-0 cursor-pointer disabled:cursor-wait"
                >
                  {previewing ? (
                    <video src={item.previewUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
                {item.durationSec != null && (
                  <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/65 px-1 text-[10px] text-white">
                    {fmtDuration(item.durationSec)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => save(item)}
                  disabled={busy !== null || isSaved}
                  aria-label={isSaved ? "Saved to Assets" : `Save ${item.name} to Assets`}
                  title={isSaved ? "In your Assets" : "Save to Assets"}
                  className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-editor-sm bg-black/65 text-white transition-opacity hover:bg-black/80 disabled:cursor-default"
                >
                  {isBusy && busy?.action === "save" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isSaved ? (
                    <BookmarkCheck className="h-3.5 w-3.5 text-editor-accent" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                </button>
                <span
                  className={`pointer-events-none absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-editor-sm bg-editor-accent py-1 text-[11px] font-semibold text-editor-bg transition-opacity ${
                    isBusy && busy?.action === "add" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {isBusy && busy?.action === "add" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {isBusy && busy?.action === "add" ? "Adding…" : "Add"}
                </span>
              </div>
            );
          })}
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
