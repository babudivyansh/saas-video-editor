"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Modal } from "@/app/components/ui/Modal";
import { useAssetDetail } from "../hooks/useAssetDetail";
import {
  RelatedSection, RelatedRail, RelatedList, RelatedEmpty, RelatedLoading,
  fmtDuration, fmtSize,
} from "@/app/components/related/RelatedContent";
import type { Asset } from "../types";

interface PreviewLightboxProps {
  asset: Asset | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/** Human label for the feature an asset came in through. */
const SOURCE_LABELS: Record<string, string> = {
  upload: "Uploaded",
  autoclip: "AutoClip",
  "url-import": "URL import",
  editor: "Editor",
  "ai-creator": "AI Creator",
  "video-generator": "Video Generator",
  "text-video": "Text to Video",
  avatar: "Avatar",
  stock: "Stock",
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">{label}</p>
      <p className="text-ink font-medium mt-0.5">{value}</p>
    </div>
  );
}

export function PreviewLightbox({ asset, onClose, onPrev, onNext }: PreviewLightboxProps) {
  // Provenance is fetched alongside the preview so a user can see what an
  // upload actually produced without leaving the grid. Keyed by id, so paging
  // through with the arrow keys refetches per asset and React Query dedupes.
  const { data, isLoading } = useAssetDetail(asset?.id ?? null);
  const related = data?.related;

  useEffect(() => {
    if (!asset) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asset, onPrev, onNext]);

  const hasAnyRelated =
    !!related &&
    (related.usedIn.length > 0 ||
      related.producedClips.length > 0 ||
      related.siblings.length > 0 ||
      related.derivedFrom !== null);

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {asset.kind === "image" && <img src={asset.url} alt={asset.name} className="w-full max-h-[60vh] object-contain" />}

            <button onClick={onPrev} aria-label="Previous asset" className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button onClick={onNext} aria-label="Next asset" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          {/* Actions the lightbox previously had none of. */}
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/assets/${asset.id}`}
              className="min-h-[36px] px-3.5 rounded-xl border border-card-border bg-white text-ink text-xs font-semibold hover:bg-tint-blue transition-colors flex items-center"
            >
              Open detail
            </Link>
            <a
              href={asset.url}
              download={asset.name}
              className="min-h-[36px] px-3.5 rounded-xl border border-card-border bg-white text-ink text-xs font-semibold hover:bg-tint-blue transition-colors flex items-center"
            >
              Download
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Meta label="Size" value={fmtSize(asset.size)} />
            <Meta label="Duration" value={asset.duration ? fmtDuration(asset.duration) : "—"} />
            <Meta
              label="Dimensions"
              value={asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}
            />
            <Meta label="Type" value={asset.mimeType} />
            <Meta label="Added" value={new Date(asset.createdAt).toLocaleDateString()} />
            <Meta label="Source" value={SOURCE_LABELS[asset.sourceFeature] ?? asset.sourceFeature} />
            <Meta label="Folder" value={asset.folder?.name ?? "Unfiled"} />
            <Meta
              label="Status"
              value={asset.moderationStatus === "flagged" ? "Under review" : asset.status}
            />
          </div>

          {asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {asset.tags.map((t) => (
                <span key={t.id} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tint-violet text-accent-violet">{t.name}</span>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-card-border space-y-4">
            {isLoading && <RelatedLoading />}

            {related && !hasAnyRelated && (
              <RelatedEmpty message="Nothing else references this asset yet." />
            )}

            {related?.derivedFrom && (
              <RelatedSection title="This file came from">
                <RelatedList
                  items={[{
                    id: related.derivedFrom.clip.id,
                    title: related.derivedFrom.clip.title || `Clip ${related.derivedFrom.clip.index + 1}`,
                    meta: related.derivedFrom.project.title,
                    href: `/dashboard/create/auto-clip?project=${related.derivedFrom.project.id}`,
                  }]}
                />
              </RelatedSection>
            )}

            {related && related.producedClips.length > 0 && (
              <RelatedSection title="Clips produced" count={related.producedClips.length}>
                <RelatedRail
                  items={related.producedClips.map((c) => ({
                    id: c.id,
                    title: c.title || `Clip ${c.index + 1}`,
                    meta: fmtDuration(c.durationSec),
                    thumbnailUrl: c.thumbnailUrl,
                    score: c.score,
                    href: `/dashboard/create/auto-clip?project=${c.projectId}&clip=${c.id}`,
                  }))}
                />
              </RelatedSection>
            )}

            {related && related.usedIn.length > 0 && (
              <RelatedSection title="Used in" count={related.usedIn.length}>
                <RelatedList
                  items={related.usedIn.map((p) => ({
                    id: p.id,
                    title: p.title,
                    meta: `${p.clipCount} clip${p.clipCount === 1 ? "" : "s"} · ${p.status}`,
                    href:
                      p.productType === "editor"
                        ? `/dashboard/editor?projectId=${p.id}`
                        : `/dashboard/create/auto-clip?project=${p.id}`,
                  }))}
                />
              </RelatedSection>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
