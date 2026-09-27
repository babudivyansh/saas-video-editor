"use client";

import { useState } from "react";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import type { AssetFolder, Tag } from "../types";

export type QuickView = "all" | "favorites" | "archive";

// Replaces the second left-hand column the library used to have (a sidebar
// inside the app's own sidebar). Quick views, folders and tags now run across
// the top of the page, so the file list and the details panel get the width.
// Folder tabs still accept an asset dragged onto them. Menus go through the
// portaled ContextMenu because this row scrolls sideways, and an anchored
// dropdown inside an overflow container gets clipped.

interface LibraryBarProps {
  view: QuickView;
  totalCount?: number;
  onViewChange: (v: QuickView) => void;
  folders: AssetFolder[];
  activeFolderId?: string;
  onFolderSelect: (id?: string) => void;
  onFolderCreate: (name: string) => void;
  onFolderRename: (id: string, name: string) => void;
  onFolderDelete: (id: string) => void;
  onFolderDrop: (folderId: string, assetId: string) => void;
  tags: Tag[];
  activeTag?: string;
  onTagSelect: (name?: string) => void;
  onTagRename: (tag: Tag) => void;
  onTagDelete: (tag: Tag) => void;
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className: "w-4 h-4 shrink-0" } as const;
const IcBox = () => <svg {...svg}><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 7V5h8v2" /></svg>;
const IcStar = () => <svg {...svg}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>;
const IcArchive = () => <svg {...svg}><path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4" /></svg>;
const IcFolder = () => <svg {...svg}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
const IcTag = () => <svg {...svg}><path d="M20 12l-8 8-9-9V3h8zM7.5 7.5h.01" /></svg>;
const IcPlus = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>;
const IcChevron = () => <svg {...svg} className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>;

function tabClass(active: boolean, dragOver = false) {
  return `-mb-px inline-flex items-center gap-2 h-11 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer outline-none focus-visible:text-fg ${
    active ? "border-primary text-fg" : dragOver ? "border-primary/50 text-primary" : "border-transparent text-fg-muted hover:text-fg"
  }`;
}

export function LibraryBar({
  view, totalCount, onViewChange, folders, activeFolderId, onFolderSelect, onFolderCreate, onFolderRename, onFolderDelete, onFolderDrop,
  tags, activeTag, onTagSelect, onTagRename, onTagDelete,
}: LibraryBarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const folderMenu = useContextMenu<AssetFolder>();
  const tagMenu = useContextMenu();
  const activeTagRow = tags.find((t) => t.name === activeTag);

  function submitCreate() {
    if (newName.trim()) onFolderCreate(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="flex items-center gap-6 border-b border-line overflow-x-auto overflow-y-hidden">
      <button type="button" className={tabClass(view === "all" && !activeFolderId)} onClick={() => { onViewChange("all"); onFolderSelect(undefined); }}>
        <IcBox /> All assets
        {totalCount !== undefined && <span className="text-xs font-semibold px-2 py-px rounded-full bg-surface-3 text-fg-muted">{totalCount}</span>}
      </button>
      <button type="button" className={tabClass(view === "favorites")} onClick={() => onViewChange("favorites")}>
        <IcStar /> Favorites
      </button>
      <button type="button" className={tabClass(view === "archive")} onClick={() => onViewChange("archive")}>
        <IcArchive /> Archive
      </button>

      {folders.map((f) =>
        renamingId === f.id ? (
          <input
            key={f.id}
            autoFocus
            aria-label="Folder name"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameVal.trim()) { onFolderRename(f.id, renameVal.trim()); setRenamingId(null); }
              if (e.key === "Escape") setRenamingId(null);
            }}
            onBlur={() => setRenamingId(null)}
            className="h-8 w-40 shrink-0 text-sm bg-surface-2 border border-primary/60 rounded-lg px-2.5 text-fg outline-none"
          />
        ) : (
          <FolderTab
            key={f.id}
            folder={f}
            active={view === "all" && activeFolderId === f.id}
            onSelect={() => { onViewChange("all"); onFolderSelect(f.id); }}
            onDrop={(assetId) => onFolderDrop(f.id, assetId)}
            onOptions={(e) => folderMenu.show(e, f)}
          />
        ),
      )}

      {tags.length > 0 && (
        <button type="button" onClick={(e) => tagMenu.show(e)} aria-haspopup="menu" aria-expanded={tagMenu.open} className={tabClass(!!activeTag)}>
          <IcTag /> {activeTag ?? "Tags"} <IcChevron />
        </button>
      )}

      <div className="flex-1" />

      {creating ? (
        <input
          autoFocus
          aria-label="New folder name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }}
          onBlur={submitCreate}
          placeholder="Folder name"
          className="mb-1.5 h-9 w-44 shrink-0 text-sm bg-surface-2 border border-primary/60 rounded-lg px-3 text-fg placeholder:text-fg-subtle outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mb-1.5 shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-line-strong text-[13px] font-medium text-fg-muted hover:text-fg hover:border-primary transition-colors cursor-pointer"
        >
          <IcPlus /> New folder
        </button>
      )}

      <ContextMenu open={folderMenu.open} x={folderMenu.x} y={folderMenu.y} onClose={folderMenu.close}>
        {folderMenu.data && (
          <>
            <ContextMenuItem onClick={() => { setRenamingId(folderMenu.data!.id); setRenameVal(folderMenu.data!.name); folderMenu.close(); }}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              danger
              onClick={() => {
                const id = folderMenu.data!.id;
                if (activeFolderId === id) onFolderSelect(undefined);
                onFolderDelete(id);
                folderMenu.close();
              }}
            >
              Delete folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      <ContextMenu open={tagMenu.open} x={tagMenu.x} y={tagMenu.y} onClose={tagMenu.close}>
        <div className="max-h-64 overflow-y-auto">
          {tags.map((t) => (
            <ContextMenuItem key={t.id} onClick={() => { onTagSelect(activeTag === t.name ? undefined : t.name); tagMenu.close(); }}>
              <span className={`truncate ${activeTag === t.name ? "text-primary" : ""}`}>{t.name}</span>
              <span className="ml-auto pl-4 text-xs text-fg-subtle">{t.assetCount}</span>
            </ContextMenuItem>
          ))}
        </div>
        {/* Managing a tag acts on the one being filtered by, so the menu stays
            a plain list rather than a row of tiny buttons per tag. */}
        {activeTagRow && (
          <div className="border-t border-line mt-1 pt-1">
            <ContextMenuItem onClick={() => { onTagSelect(undefined); tagMenu.close(); }}>Clear tag filter</ContextMenuItem>
            <ContextMenuItem onClick={() => { onTagRename(activeTagRow); tagMenu.close(); }}>Rename “{activeTagRow.name}”…</ContextMenuItem>
            <ContextMenuItem danger onClick={() => { onTagDelete(activeTagRow); tagMenu.close(); }}>Delete “{activeTagRow.name}”…</ContextMenuItem>
          </div>
        )}
      </ContextMenu>
    </div>
  );
}

function FolderTab({
  folder, active, onSelect, onDrop, onOptions,
}: {
  folder: AssetFolder;
  active: boolean;
  onSelect: () => void;
  onDrop: (assetId: string) => void;
  onOptions: (e: React.MouseEvent) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="group/folder relative flex items-center shrink-0">
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => { e.preventDefault(); onOptions(e); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData("text/asset-id"); if (id) onDrop(id); }}
        className={tabClass(active, dragOver)}
      >
        <span style={{ color: folder.color ?? undefined }}><IcFolder /></span>
        {folder.name}
        <span className="text-xs text-fg-subtle">{folder.assetCount}</span>
      </button>
      <button
        type="button"
        onClick={onOptions}
        aria-label={`Folder options for ${folder.name}`}
        aria-haspopup="menu"
        className="ml-0.5 w-6 h-6 rounded-md flex items-center justify-center text-fg-subtle opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 hover:text-fg hover:bg-surface-3 cursor-pointer"
      >
        <IcChevron />
      </button>
    </div>
  );
}
