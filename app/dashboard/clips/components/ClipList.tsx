"use client";

import type { ClipRow } from "../hooks/useClipsLibrary";
import { ClipStatusChip, IcFilm, IcMore, IcStar, IcVideo, clipTitle, fmtDuration, scoreTone } from "./clipUi";

// Columns: clip · score · length · status · actions. Score and length drop
// out below `md`, where the score moves next to the title instead.
const COLS = "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_124px_52px_84px_76px] gap-3 items-center";

export function ClipList({
  clips,
  selectedId,
  onSelect,
  onToggleFavorite,
  onMenu,
}: {
  clips: ClipRow[];
  selectedId: string | null;
  onSelect: (clip: ClipRow) => void;
  onToggleFavorite: (clip: ClipRow) => void;
  onMenu: (e: React.MouseEvent, clip: ClipRow) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${COLS} hidden md:grid px-4 pb-2.5 border-b border-line text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle`}>
        <span>Clip</span>
        <span>Virality score</span>
        <span>Length</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>
      {clips.map((clip) => (
        <ClipListRow
          key={clip.id}
          clip={clip}
          selected={clip.id === selectedId}
          onSelect={() => onSelect(clip)}
          onToggleFavorite={() => onToggleFavorite(clip)}
          onMenu={(e) => onMenu(e, clip)}
        />
      ))}
    </div>
  );
}

function ClipListRow({
  clip, selected, onSelect, onToggleFavorite, onMenu,
}: {
  clip: ClipRow;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const title = clipTitle(clip);
  const hasScore = typeof clip.score === "number";
  const tone = hasScore ? scoreTone(clip.score!) : null;

  return (
    <div
      className={`group relative ${COLS} px-4 py-3 rounded-2xl border transition-colors ${
        selected ? "bg-surface-2 border-primary/30" : "border-transparent hover:bg-surface-1"
      }`}
    >
      {/* Stretched button: the whole row selects, while the star and menu
          buttons below sit above it and stay separately focusable — a row
          that was itself a <button> could not contain them. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={title}
        className="absolute inset-0 rounded-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      />

      <div className="flex items-center gap-3.5 min-w-0 pointer-events-none">
        <div className="relative w-12 aspect-[9/16] rounded-[10px] overflow-hidden bg-surface-3 border border-line shrink-0">
          {clip.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg-subtle"><IcVideo className="w-5 h-5" /></div>
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[15px] font-semibold text-fg truncate">{title}</p>
            {tone && <span className={`md:hidden text-sm font-bold ${tone.text}`}>{clip.score}</span>}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle min-w-0">
            <IcFilm className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{clip.projectTitle}</span>
          </p>
          <div className="md:hidden"><ClipStatusChip clip={clip} /></div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2.5 pointer-events-none" title="Virality score out of 99">
        {tone ? (
          <>
            <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${clip.score}%` }} />
            </span>
            <span className={`w-6 text-[15px] font-bold ${tone.text}`}>{clip.score}</span>
          </>
        ) : (
          <span className="text-sm text-fg-subtle">—</span>
        )}
      </div>

      <span className="hidden md:block font-mono text-[13px] text-fg-muted tabular-nums pointer-events-none">{fmtDuration(clip.durationSec)}</span>

      <span className="hidden md:block pointer-events-none"><ClipStatusChip clip={clip} /></span>

      <div className="relative z-10 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={clip.isFavorite ? "Remove star" : "Star this clip"}
          aria-pressed={clip.isFavorite}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            clip.isFavorite ? "text-warning" : "text-fg-subtle hover:text-fg hover:bg-surface-3"
          }`}
        >
          <IcStar filled={clip.isFavorite} />
        </button>
        <button
          type="button"
          onClick={onMenu}
          aria-label="Clip actions"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
        >
          <IcMore />
        </button>
      </div>
    </div>
  );
}
