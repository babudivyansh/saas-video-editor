"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Asset } from "../types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  assets: Asset[];
  onOpenAsset: (asset: Asset) => void;
  onUpload: () => void;
  onGoAll: () => void;
  onGoFavorites: () => void;
  onGoArchive: () => void;
}

export function CommandPalette({ open, onClose, assets, onOpenAsset, onUpload, onGoAll, onGoFavorites, onGoArchive }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => { if (open) { setQ(""); setActiveIndex(0); } }, [open]);

  const actions = useMemo(() => [
    { id: "upload", label: "Upload files" as const, onRun: onUpload },
    { id: "all", label: "Go to All assets" as const, onRun: onGoAll },
    { id: "favorites", label: "Go to Favorites" as const, onRun: onGoFavorites },
    { id: "archive", label: "Go to Archive" as const, onRun: onGoArchive },
  ], [onUpload, onGoAll, onGoFavorites, onGoArchive]);

  const matchedActions = useMemo(
    () => (q ? actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase())) : actions),
    [q, actions],
  );
  const matchedAssets = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    return assets.filter((a) => a.name.toLowerCase().includes(lower)).slice(0, 8);
  }, [q, assets]);

  const results = useMemo(
    () => [
      ...matchedActions.map((a) => ({ type: "action" as const, id: a.id, label: a.label, run: a.onRun })),
      ...matchedAssets.map((a) => ({ type: "asset" as const, id: a.id, asset: a })),
    ],
    [matchedActions, matchedAssets],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const r = results[activeIndex];
        if (!r) return;
        if (r.type === "action") r.run();
        else onOpenAsset(r.asset);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, activeIndex, onClose, onOpenAsset]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg mx-4 bg-panel rounded-2xl shadow-2xl border border-card-border overflow-hidden"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActiveIndex(0); }}
              placeholder="Search assets or run a command…"
              className="w-full text-sm px-4 py-3.5 outline-none border-b border-card-border"
            />
            <div className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 && <p className="text-xs text-ink-soft px-4 py-3">No matches.</p>}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { if (r.type === "action") r.run(); else onOpenAsset(r.asset); onClose(); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-2 text-left text-sm px-4 py-2.5 cursor-pointer ${i === activeIndex ? "bg-tint-violet text-brand" : "text-ink hover:bg-tint-blue"}`}
                >
                  {r.type === "asset" && <span className="text-[10px] font-bold uppercase text-ink-soft/60 w-10 flex-shrink-0">{r.asset.kind}</span>}
                  <span className="truncate">{r.type === "action" ? r.label : r.asset.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
