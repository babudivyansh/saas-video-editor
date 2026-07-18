"use client";

import { useEffect } from "react";
import { Modal } from "@/app/components/ui/Modal";
import type { Asset } from "../types";

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface PreviewLightboxProps {
  asset: Asset | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function PreviewLightbox({ asset, onClose, onPrev, onNext }: PreviewLightboxProps) {
  useEffect(() => {
    if (!asset) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asset, onPrev, onNext]);

  return (
    <Modal open={!!asset} onClose={onClose} title={asset?.name} maxWidth="max-w-3xl">
      {asset && (
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center" style={{ maxHeight: "60vh" }}>
            {asset.kind === "video" && <video src={asset.url} controls autoPlay className="w-full max-h-[60vh]" />}
            {asset.kind === "audio" && (
              <div className="w-full py-12 px-6 bg-gradient-to-br from-tint-violet to-tint-fuchsia flex flex-col items-center gap-4">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-accent-violet/50">
                  <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
                <audio src={asset.url} controls autoPlay className="w-full max-w-md" />
              </div>
            )}
            {asset.kind === "image" && <img src={asset.url} alt={asset.name} className="w-full max-h-[60vh] object-contain" />}

            <button onClick={onPrev} aria-label="Previous asset" className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button onClick={onNext} aria-label="Next asset" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">Size</p><p className="text-ink font-medium mt-0.5">{fmtSize(asset.size)}</p></div>
            {asset.duration && <div><p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">Duration</p><p className="text-ink font-medium mt-0.5">{Math.floor(asset.duration / 60)}:{Math.floor(asset.duration % 60).toString().padStart(2, "0")}</p></div>}
            {asset.width && asset.height && <div><p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">Dimensions</p><p className="text-ink font-medium mt-0.5">{asset.width}×{asset.height}</p></div>}
            <div><p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">Type</p><p className="text-ink font-medium mt-0.5">{asset.mimeType}</p></div>
          </div>

          {asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {asset.tags.map((t) => (
                <span key={t.id} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tint-violet text-accent-violet">{t.name}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
