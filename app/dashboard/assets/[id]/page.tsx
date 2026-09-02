"use client";

import { use } from "react";
import Link from "next/link";
import { useAssetDetail } from "../hooks/useAssetDetail";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Button } from "@/app/components/ui/Button";
import {
  RelatedSection, RelatedRail, RelatedList, RelatedEmpty,
  fmtDuration, fmtSize,
} from "@/app/components/related/RelatedContent";
import type { Asset } from "../types";

// Deep-linkable asset detail.
//
// The library had no per-asset route at all: an asset could only be inspected
// through a lightbox indexed by its position in an in-memory array, so it
// couldn't be linked to, shared, or reopened after a reload — and the "related"
// graph had nowhere to live that was big enough to read.

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-soft/60 font-semibold uppercase tracking-wide text-[10px]">{label}</p>
      <p className="text-ink font-medium mt-0.5 text-xs break-words">{value}</p>
    </div>
  );
}

/** Human label for the feature an asset came in through. */
const SOURCE_LABELS: Record<string, string> = {
  upload: "Uploaded",
  autoclip: "AutoClip",
  "url-import": "Imported from a URL",
  editor: "Editor",
  "ai-creator": "AI Creator",
  "video-generator": "Video Generator",
  "text-video": "Text to Video",
  avatar: "Avatar",
  stock: "Stock library",
};

function AssetPlayer({ asset }: { asset: Asset }) {
  if (asset.kind === "video") {
    return <video src={asset.url} controls className="w-full max-h-[55vh] bg-black" />;
  }
  if (asset.kind === "audio") {
    return (
      <div className="w-full py-12 px-6 bg-gradient-to-br from-tint-violet to-tint-fuchsia flex flex-col items-center gap-4">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-accent-violet/50">
          <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
        <audio src={asset.url} controls className="w-full max-w-md" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.url} alt={asset.name} className="w-full max-h-[55vh] object-contain bg-black" />;
}

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useAssetDetail(id);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 pt-6 pb-12 space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[45vh] w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 pt-16 pb-12 text-center space-y-4">
        <h1 className="text-lg font-bold text-ink">We couldn&apos;t open this asset</h1>
        <p className="text-sm text-ink-soft">
          It may have been deleted, or it belongs to a different account.
        </p>
        <Button href="/dashboard/assets" variant="primary">Back to Assets</Button>
      </div>
    );
  }

  const { asset, related } = data;
  const hasAnyRelated =
    related.usedIn.length > 0 ||
    related.producedClips.length > 0 ||
    related.siblings.length > 0 ||
    related.derivedFrom !== null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 pt-6 pb-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard/assets" className="text-xs font-semibold text-brand hover:underline">
            ← Assets
          </Link>
          <h1 className="text-xl font-extrabold text-ink truncate mt-1">{asset.name}</h1>
        </div>
        <a
          href={asset.url}
          download={asset.name}
          className="shrink-0 min-h-[40px] px-4 rounded-xl grad-brand text-white text-[13px] font-bold shadow-glow flex items-center"
        >
          Download
        </a>
      </div>

      <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center">
        <AssetPlayer asset={asset} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-surface">
        <MetaRow label="Size" value={fmtSize(asset.size)} />
        <MetaRow label="Duration" value={asset.duration ? fmtDuration(asset.duration) : "—"} />
        <MetaRow
          label="Dimensions"
          value={asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}
        />
        <MetaRow label="Type" value={asset.mimeType} />
        <MetaRow label="Added" value={new Date(asset.createdAt).toLocaleDateString()} />
        <MetaRow label="Source" value={SOURCE_LABELS[asset.sourceFeature] ?? asset.sourceFeature} />
        <MetaRow label="Folder" value={asset.folder?.name ?? "Unfiled"} />
        <MetaRow
          label="Status"
          value={asset.moderationStatus === "flagged" ? "Under review" : asset.status}
        />
      </div>

      {asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {asset.tags.map((t) => (
            <span key={t.id} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tint-violet text-accent-violet">
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-5 pt-2 border-t border-card-border">
        <h2 className="text-sm font-extrabold text-ink pt-4">Related</h2>

        {!hasAnyRelated && (
          <RelatedEmpty message="Nothing else references this asset yet. Run AutoClip on it and its clips will show up here." />
        )}

        {related.derivedFrom && (
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

        {related.producedClips.length > 0 && (
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

        {related.usedIn.length > 0 && (
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

        {related.siblings.length > 0 && (
          <RelatedSection title="Came in together" count={related.siblings.length}>
            <RelatedRail
              items={related.siblings.map((a) => ({
                id: a.id,
                title: a.name,
                meta: a.duration ? fmtDuration(a.duration) : fmtSize(a.size),
                thumbnailUrl: a.thumbnailUrl,
                href: `/dashboard/assets/${a.id}`,
              }))}
            />
          </RelatedSection>
        )}
      </div>
    </div>
  );
}
