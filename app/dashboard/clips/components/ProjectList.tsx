"use client";

import { IcMore } from "./clipUi";
import { IcFilm, ProjectCover, ProjectStatusChip, clipCountLabel, fmtDate, type ProjectRow } from "./projectUi";

// Columns: project · clips · started · status · actions. Clips and date drop
// out below `md`, where they move under the title instead.
const COLS = "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_84px_108px_128px_40px] gap-3 items-center";

export function ProjectList({
  projects, selectedId, onSelect, onMenu,
}: {
  projects: ProjectRow[];
  selectedId: string | null;
  onSelect: (p: ProjectRow) => void;
  onMenu: (e: React.MouseEvent, p: ProjectRow) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${COLS} hidden md:grid px-4 pb-2.5 border-b border-line text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle`}>
        <span>Project</span>
        <span>Clips</span>
        <span>Started</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>
      {projects.map((p) => {
        const selected = p.id === selectedId;
        return (
          <div
            key={p.id}
            className={`group relative ${COLS} px-4 py-3 rounded-2xl border transition-colors ${
              selected ? "bg-surface-2 border-primary/30" : "border-transparent hover:bg-surface-1"
            }`}
          >
            {/* Stretched button, as in ClipList: the row selects, the menu
                button above it stays its own focus stop. */}
            <button
              type="button"
              onClick={() => onSelect(p)}
              aria-pressed={selected}
              aria-label={p.title}
              className="absolute inset-0 rounded-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            />
            <div className="flex items-center gap-3.5 min-w-0 pointer-events-none">
              <ProjectCover project={p} className="w-24 rounded-[10px] shrink-0" />
              <div className="min-w-0 flex flex-col gap-1.5">
                <p className="text-[15px] font-semibold text-fg truncate" title={p.title}>{p.title}</p>
                <p className="md:hidden flex items-center gap-1.5 text-xs text-fg-subtle">
                  <IcFilm /> {clipCountLabel(p._count.clips)} · {fmtDate(p.createdAt)}
                </p>
                <div className="md:hidden"><ProjectStatusChip project={p} /></div>
              </div>
            </div>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[13px] text-fg-muted pointer-events-none">
              <IcFilm /> {p._count.clips}
            </span>
            <span className="hidden md:block font-mono text-[13px] text-fg-muted pointer-events-none">{fmtDate(p.createdAt)}</span>
            <span className="hidden md:block pointer-events-none"><ProjectStatusChip project={p} /></span>
            <div className="relative z-10 flex justify-end">
              <button
                type="button"
                onClick={(e) => onMenu(e, p)}
                aria-label="Project actions"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <IcMore />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
