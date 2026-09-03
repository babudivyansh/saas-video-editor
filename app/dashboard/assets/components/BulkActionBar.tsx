"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import type { AssetFolder } from "../types";
import type { QuickView } from "./Sidebar";

interface BulkActionBarProps {
  count: number;
  view: QuickView;
  folders: AssetFolder[];
  onFavorite: () => void;
  onUnfavorite: () => void;
  onMove: (folderId: string | null) => void;
  onTag: (name: string) => void;
  onDownload: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count, view, folders, onFavorite, onUnfavorite, onMove, onTag, onDownload, onArchive, onRestore, onPermanentDelete, onClear,
}: BulkActionBarProps) {
  const [tagInput, setTagInput] = useState("");

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-1.5 bg-ink text-white rounded-full shadow-xl px-2 py-2 max-w-[95vw]"
        >
          <span className="text-xs font-bold px-3 whitespace-nowrap">{count} selected</span>

          {view !== "archive" ? (
            <>
              <button onClick={onFavorite} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Favorite</button>
              <button onClick={onUnfavorite} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Unfavorite</button>

              <Dropdown
                align="left"
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Move to…</button>
                )}
              >
                {({ close }) => (
                  <div className="py-1 max-h-56 overflow-y-auto">
                    <DropdownItem onClick={() => { onMove(null); close(); }}>Unfiled</DropdownItem>
                    {folders.map((f) => (
                      <DropdownItem key={f.id} onClick={() => { onMove(f.id); close(); }}>{f.name}</DropdownItem>
                    ))}
                  </div>
                )}
              </Dropdown>

              <Dropdown
                align="left"
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Tag…</button>
                )}
              >
                {({ close }) => (
                  <form
                    onSubmit={(e) => { e.preventDefault(); if (tagInput.trim()) { onTag(tagInput.trim()); setTagInput(""); close(); } }}
                    className="p-2 flex gap-1.5"
                  >
                    <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="tag name"
                      className="text-sm text-ink border border-card-border rounded-lg px-2 py-1.5 w-32 outline-none focus:border-violet-300" />
                    <button type="submit" className="text-xs font-semibold text-on-primary grad-brand rounded-lg px-3 cursor-pointer">Add</button>
                  </form>
                )}
              </Dropdown>

              <button onClick={onDownload} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Download</button>
              <button onClick={onArchive} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Archive</button>
            </>
          ) : (
            <>
              <button onClick={onRestore} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Restore</button>
              <button onClick={onDownload} className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/10 cursor-pointer whitespace-nowrap">Download</button>
              <button onClick={onPermanentDelete} className="text-xs font-semibold px-3 py-1.5 rounded-full text-red-300 hover:bg-red-500/20 cursor-pointer whitespace-nowrap">Delete permanently</button>
            </>
          )}

          <button onClick={onClear} aria-label="Clear selection" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
