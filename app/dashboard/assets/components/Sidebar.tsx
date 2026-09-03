"use client";

import { useState } from "react";
import type { AssetFolder, Tag } from "../types";

export type QuickView = "all" | "favorites" | "archive";

interface SidebarProps {
  view: QuickView;
  onViewChange: (v: QuickView) => void;
  folders: AssetFolder[];
  activeFolderId?: string;
  onFolderSelect: (id?: string) => void;
  onFolderCreate: (name: string) => void;
  onFolderRename: (id: string, name: string) => void;
  onFolderDelete: (id: string) => void;
  onFolderDrop: (folderId: string, assetId: string) => void;
  tags: Tag[];
  /** Rename a tag everywhere it is used. Optional so the sidebar stays usable
   *  in contexts that only browse. */
  onTagRename?: (tag: Tag) => void;
  onTagDelete?: (tag: Tag) => void;
  activeTag?: string;
  onTagSelect: (name?: string) => void;
}

function IcHome() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>; }
function IcStar() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>; }
function IcArchive() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>; }
function IcFolder() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>; }
function IcPlus() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>; }

function NavRow({ active, icon, label, count, onClick, onDrop }: {
  active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void; onDrop?: (e: React.DragEvent) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <button
      onClick={onClick}
      onDragOver={onDrop ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={onDrop ? () => setDragOver(false) : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); setDragOver(false); onDrop(e); } : undefined}
      className={`w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-xl transition-colors cursor-pointer ${
        active ? "bg-tint-emerald text-brand font-medium" : dragOver ? "bg-tint-violet text-brand" : "text-ink-soft hover:bg-tint-blue hover:text-ink"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className={`text-[10px] font-bold ${active ? "text-brand/90" : "text-ink-soft/60"}`}>{count}</span>}
    </button>
  );
}

export function Sidebar({
  view, onViewChange, folders, activeFolderId, onFolderSelect, onFolderCreate, onFolderRename, onFolderDelete, onFolderDrop,
  tags, activeTag, onTagSelect, onTagRename, onTagDelete,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  function submitCreate() {
    if (newName.trim()) onFolderCreate(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <aside className="w-full lg:w-56 flex-shrink-0 space-y-5">
      <div className="space-y-1">
        <NavRow active={view === "all" && !activeFolderId} icon={<IcHome />} label="All assets" onClick={() => { onViewChange("all"); onFolderSelect(undefined); }} />
        <NavRow active={view === "favorites"} icon={<IcStar />} label="Favorites" onClick={() => onViewChange("favorites")} />
        <NavRow active={view === "archive"} icon={<IcArchive />} label="Archive" onClick={() => onViewChange("archive")} />
      </div>

      <div>
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">Folders</span>
          <button onClick={() => setCreating(true)} className="w-5 h-5 rounded-full flex items-center justify-center text-ink-soft hover:bg-tint-blue hover:text-brand transition-colors cursor-pointer" title="New folder">
            <IcPlus />
          </button>
        </div>
        <div className="space-y-1">
          {folders.map((f) => (
            <div key={f.id} className="group/folder relative">
              {renamingId === f.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameVal.trim()) { onFolderRename(f.id, renameVal.trim()); setRenamingId(null); }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => setRenamingId(null)}
                  className="w-full text-sm border border-violet-400 rounded-xl px-3 py-2 outline-none"
                />
              ) : (
                <NavRow
                  active={view === "all" && activeFolderId === f.id}
                  icon={<span style={{ color: f.color ?? undefined }}><IcFolder /></span>}
                  label={f.name}
                  count={f.assetCount}
                  onClick={() => { onViewChange("all"); onFolderSelect(f.id); }}
                  onDrop={(e) => { const id = e.dataTransfer.getData("text/asset-id"); if (id) onFolderDrop(f.id, id); }}
                />
              )}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/folder:flex items-center gap-0.5 bg-panel rounded-lg">
                <button onClick={() => { setRenamingId(f.id); setRenameVal(f.name); }} className="w-5 h-5 flex items-center justify-center text-ink-soft hover:text-brand cursor-pointer" title="Rename">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button onClick={() => onFolderDelete(f.id)} className="w-5 h-5 flex items-center justify-center text-ink-soft hover:text-error cursor-pointer" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
          ))}
          {creating && (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }}
              onBlur={submitCreate}
              placeholder="Folder name"
              className="w-full text-sm border border-violet-400 rounded-xl px-3 py-2 outline-none"
            />
          )}
          {folders.length === 0 && !creating && <p className="text-xs text-ink-soft px-3">No folders yet.</p>}
        </div>
      </div>

      {tags.length > 0 && (
        <div>
          <span className="text-[10px] font-bold text-ink-soft uppercase tracking-widest px-1 mb-1.5 block">Tags</span>
          <div className="flex flex-wrap gap-1.5 px-1">
            {tags.map((t) => (
              <span key={t.id} className="group/tag relative inline-flex">
                <button
                  onClick={() => onTagSelect(activeTag === t.name ? undefined : t.name)}
                  onDoubleClick={() => onTagRename?.(t)}
                  title={`${t.assetCount} file${t.assetCount === 1 ? "" : "s"} — double-click to rename`}
                  className={`text-[11px] font-semibold pl-2.5 pr-5 py-1 rounded-full transition-colors cursor-pointer ${
                    activeTag === t.name ? "grad-brand text-on-primary" : "bg-panel border border-card-border text-ink-soft hover:bg-tint-violet"
                  }`}
                >
                  {t.name}
                </button>
                {onTagDelete && (
                  <button
                    onClick={() => onTagDelete(t)}
                    aria-label={`Delete tag ${t.name}`}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full text-[9px] leading-none opacity-0 group-hover/tag:opacity-100 transition-opacity cursor-pointer ${
                      activeTag === t.name ? "text-white/70 hover:text-white" : "text-ink-soft/50 hover:text-rose-600"
                    }`}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
