"use client";

// Stock music (Jamendo, CC-licensed). Each row previews the real track in
// the panel (play/pause, live equalizer, progress) — one shared <audio> so
// only one ever plays — and "+" imports it as an owned Asset and drops it on
// the audio track at the playhead.

import React, { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, Plus, Search } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { fmtDuration } from "./shared/assetData";
import { useStockSearch, importStockItem, type StockItem } from "./useStockSearch";
import { Button, showPanelToast } from "../ui";
import SearchField from "./shared/SearchField";
import PanelStatus from "./shared/PanelStatus";
import { playUiSound } from "../../hooks/useUiSound";

const MOODS = ["lofi", "upbeat", "chill", "cinematic", "hype", "corporate"];

export default function StockAudioPanel() {
  const addAudioClip = useEditorStore((s) => s.addAudioClip);
  const { query, setQuery, items, loading, error, hasMore, loadMore } = useStockSearch("audio");
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // One preview player for the panel's lifetime; stops when the panel closes
  // or the tab changes.
  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => setPlaying(null);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    audioRef.current = el;
    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, []);

  const togglePreview = (item: StockItem) => {
    const el = audioRef.current;
    if (!el) return;
    if (playing === item.id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = item.previewUrl ?? item.downloadUrl;
    el.currentTime = 0;
    setProgress(0);
    setPlaying(item.id);
    el.play().catch(() => {
      setPlaying(null);
      showPanelToast("Couldn't play that preview");
    });
  };

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
      playUiSound("add");
      showPanelToast(`“${item.name}” added to the audio track`);
    } finally {
      setAdding(null);
    }
  };

  const nowPlaying = items.find((i) => i.id === playing);

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <SearchField value={query} onChange={setQuery} placeholder="Search stock music…" />
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Moods">
        {MOODS.map((m) => {
          const on = query.trim().toLowerCase() === m || (!query.trim() && m === "lofi");
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setQuery(m === "lofi" && !query.trim() ? "" : m);
                playUiSound("chip");
              }}
              className={`editor-press h-7 flex-shrink-0 rounded-full border px-3 text-[12px] font-medium capitalize ${
                on ? "border-editor-accent bg-editor-accent/15 text-editor-accent" : "border-editor-border-strong text-editor-text-muted hover:text-editor-text"
              }`}
            >
              {m === "lofi" ? "Lo-fi" : m}
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && items.length === 0 && !loading && (
        <PanelStatus state="empty" icon={<Search className="h-5 w-5" />} message="Search CC-licensed music — powered by Jamendo." />
      )}
      {loading && items.length === 0 && <PanelStatus state="loading" message="Searching…" />}

      {items.length > 0 && (
        <div className="editor-stagger-grid -mx-1 flex flex-col gap-0.5">
          {items.map((item) => {
            const isPlaying = playing === item.id;
            return (
              <div
                key={item.id}
                title={item.attribution}
                className={`relative flex items-center gap-2.5 rounded-editor-md px-2 py-2 transition-colors ${isPlaying ? "bg-editor-card" : "hover:bg-white/[0.03]"}`}
              >
                <button
                  type="button"
                  onClick={() => togglePreview(item)}
                  aria-label={isPlaying ? `Pause ${item.name}` : `Play ${item.name}`}
                  className={`editor-press flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${
                    isPlaying ? "bg-editor-accent text-editor-bg shadow-[0_0_0_4px_rgba(32,214,138,0.18)]" : "bg-editor-elevated text-editor-text hover:bg-editor-accent hover:text-editor-bg"
                  }`}
                >
                  {item.thumbUrl && !isPlaying ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[12.5px] font-semibold ${isPlaying ? "text-editor-accent" : "text-editor-text"}`}>{item.name}</span>
                  <span className="text-[11px] text-editor-text-faint">{adding === item.id ? "Adding…" : fmtDuration(item.durationSec ?? null)}</span>
                </span>
                {isPlaying && (
                  <span className="editor-eq" aria-hidden="true"><i /><i /><i /><i /></span>
                )}
                <button
                  type="button"
                  onClick={() => void add(item)}
                  disabled={adding === item.id}
                  aria-label={`Add ${item.name} to the timeline`}
                  className="editor-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-editor-sm border border-editor-border-strong text-editor-text-muted hover:border-editor-accent hover:text-editor-accent disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {isPlaying && (
                  <span className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-editor-accent/15" aria-hidden="true">
                    <span className="block h-full bg-editor-accent transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                )}
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

      <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-editor-text-faint">
        {nowPlaying ? (
          <>
            <span className="editor-eq" aria-hidden="true"><i /><i /><i /><i /></span> Previewing · {nowPlaying.name}
          </>
        ) : (
          <>
            <Music2 className="h-3 w-3" /> Press play to preview · + adds it at the playhead
          </>
        )}
      </p>
    </div>
  );
}
