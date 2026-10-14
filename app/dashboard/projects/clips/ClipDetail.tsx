"use client";

import { useState } from "react";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import { useToast } from "@/app/components/ui/Toast";
import { RetryClipButton } from "@/app/dashboard/create/auto-clip/_components/ClipActions";
import { arCss, fmtTime, scoreBand, type ScoreBreakdownWithInsights } from "@/app/dashboard/create/auto-clip/_components/shared";
import type { WorkspaceTab } from "@/app/dashboard/create/auto-clip/_components/ClipWorkspace";
import { clipGrades, type GradeKey } from "@/lib/clip-view";
import { useCollectionMutations, useCollections, FAVORITES_ID } from "../hooks/useCollections";
import { useCollectionActions } from "../components/CollectionActions";
import {
  IcCalendar, IcCaptions, IcCopy, IcDownload, IcEdit, IcFolderPlus, IcHeart, IcThumbDown, IcXml,
} from "../components/icons";
import { clipName, clipWindow, isReady, type ClipsSource, type ViewClip } from "./model";

// One clip, laid out as OpusClip's list row: feedback and score, the preview,
// the "why it works" card, and the actions. The list view renders one per clip
// and the grid view's popup renders the same thing for the clip it opened.

export interface ClipHandlers {
  onFeedback: (clip: ViewClip, field: "isFavorite" | "isDisliked", value: boolean) => void;
  onOpenWorkspace: (clip: ViewClip, tab: WorkspaceTab) => void;
  onDuplicate: (clip: ViewClip) => Promise<void>;
  onChanged: () => void;
  onRemoveFromCollection?: (clip: ViewClip) => void;
}

const GRADE_LABELS: { key: GradeKey; label: string }[] = [
  { key: "hook", label: "Hook" },
  { key: "flow", label: "Flow" },
  { key: "value", label: "Value" },
  { key: "trend", label: "Trend" },
];

function gradeTone(g: string): string {
  if (g.startsWith("A")) return "text-primary";
  if (g.startsWith("B")) return "text-success";
  return "text-fg-muted";
}

export function FeedbackButtons({ clip, onFeedback, compact = false }: { clip: ViewClip; onFeedback: ClipHandlers["onFeedback"]; compact?: boolean }) {
  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const name = clipName(clip);
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-pressed={clip.isFavorite}
        aria-label={clip.isFavorite ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
        onClick={(e) => { e.stopPropagation(); onFeedback(clip, "isFavorite", !clip.isFavorite); }}
        className={`flex ${size} items-center justify-center rounded-xl border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          clip.isFavorite ? "border-error/40 bg-error/10 text-error" : "border-line bg-surface-2/90 text-fg-muted hover:text-fg"
        }`}
      >
        <IcHeart filled={clip.isFavorite} />
      </button>
      <button
        type="button"
        aria-pressed={clip.isDisliked}
        aria-label={clip.isDisliked ? `Undo dislike on ${name}` : `Dislike ${name}`}
        onClick={(e) => { e.stopPropagation(); onFeedback(clip, "isDisliked", !clip.isDisliked); }}
        className={`flex ${size} items-center justify-center rounded-xl border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          clip.isDisliked ? "border-line-strong bg-surface-3 text-fg" : "border-line bg-surface-2/90 text-fg-muted hover:text-fg"
        }`}
      >
        <IcThumbDown filled={clip.isDisliked} />
      </button>
    </div>
  );
}

function ScoreColumn({ clip, onFeedback }: { clip: ViewClip; onFeedback: ClipHandlers["onFeedback"] }) {
  const grades = clipGrades(clip.scoreBreakdown);
  return (
    <div className="flex flex-row items-start justify-between gap-4 lg:flex-col lg:items-end lg:justify-start">
      <FeedbackButtons clip={clip} onFeedback={onFeedback} />
      <div className="lg:text-right">
        {clip.score != null ? (
          <p className="tabular-nums" aria-label={`Virality score ${clip.score} out of 100`}>
            <span className="text-2xl font-semibold" style={{ color: scoreBand(clip.score).text }}>{clip.score}</span>
            <span className="text-sm text-fg-muted">/100</span>
          </p>
        ) : (
          <p className="text-sm text-fg-subtle">No score</p>
        )}
        {grades && (
          <dl className="mt-2 space-y-1 text-sm">
            {GRADE_LABELS.map(({ key, label }) => (
              // dt then dd in the DOM for screen readers; the grade is drawn first.
              <div key={key} className="flex flex-row-reverse items-baseline justify-end gap-3 lg:justify-start">
                <dt className="w-11 text-fg-muted">{label}</dt>
                <dd className={`w-6 font-semibold tabular-nums ${grades[key] ? gradeTone(grades[key]!) : "text-fg-subtle"}`}>{grades[key] ?? "–"}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

export function ClipPreview({ clip, onChanged, className = "" }: { clip: ViewClip; onChanged: () => void; className?: string }) {
  const ready = isReady(clip);
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-line bg-surface-3 ${className}`}
      style={{ aspectRatio: arCss(clip.aspectRatio) }}
    >
      {ready ? (
        <video
          src={clip.videoUrl!}
          poster={clip.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full bg-black object-cover"
          aria-label={`Preview of ${clipName(clip)}`}
        />
      ) : (
        <>
          {clip.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          {clip.status === "failed" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-xs text-white">
              <span className="font-semibold">Failed to render</span>
              {clip.failureReason && <span className="line-clamp-3 text-[11px] text-white/80">{clip.failureReason}</span>}
              <RetryClipButton projectId={clip.projectId} clip={clip} onQueued={onChanged} />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white" role="status">
              <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white" aria-hidden />
              <span className="text-xs font-semibold">{clip.status === "queued" ? "Queued" : `Rendering ${clip.progress}%`}</span>
            </div>
          )}
        </>
      )}
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        {fmtTime(clip.durationSec)}
      </span>
    </div>
  );
}

function TextCard({ clip, rank, showProject }: { clip: ViewClip; rank: number; showProject: boolean }) {
  const [transcriptOnly, setTranscriptOnly] = useState(false);
  const reasoning = (clip.scoreBreakdown as ScoreBreakdownWithInsights | null)?.reasoning ?? null;
  const excerpt = clip.transcriptExcerpt ?? null;
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface-2 p-4">
      <h3 className="truncate text-[15px] font-medium text-fg" title={clipName(clip)}>
        <span className="mr-1.5 text-fg-subtle">#{rank}</span>
        {clipName(clip)}
      </h3>
      {showProject && <p className="mt-0.5 truncate text-xs text-fg-subtle">From {clip.projectTitle}</p>}
      <div className="mt-3 flex items-center justify-between gap-3 border-b border-line pb-3">
        <span className="text-xs font-medium text-fg-muted">Why it works</span>
        <Checkbox checked={transcriptOnly} onChange={setTranscriptOnly} label="Transcript only" showLabel />
      </div>
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm leading-relaxed">
        <p className="tabular-nums text-fg-subtle">[{clipWindow(clip)}]</p>
        {!transcriptOnly && <p className="text-fg-muted">{reasoning ?? "No analysis for this clip."}</p>}
        {excerpt ? (
          <p className="text-fg">
            <IcCaptions className="mr-1.5 inline h-4 w-4 align-[-3px] text-fg-muted" />
            {excerpt}
          </p>
        ) : (
          transcriptOnly && <p className="text-fg-subtle">Nothing is said in this clip.</p>
        )}
      </div>
    </div>
  );
}

const ACTION =
  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg transition-colors hover:bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50";

function AddToCollection({ clip }: { clip: ViewClip }) {
  const { showToast } = useToast();
  const collections = useCollections();
  const { addClips } = useCollectionMutations();
  const add = async (id: string, name: string) => {
    try {
      const { added } = await addClips.mutateAsync({ id, clipIds: [clip.id] });
      showToast(added ? `Added to ${name}` : `Already in ${name}`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };
  const actions = useCollectionActions({ onCreated: (c) => void add(c.id, c.name) });
  const list = collections.data?.collections ?? [];
  return (
    <>
      <Dropdown
        align="right"
        trigger={({ open, toggle }) => (
          <button type="button" className={ACTION} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            <IcFolderPlus /> Add to collection
          </button>
        )}
      >
        {({ close }) => (
          <div className="max-h-72 overflow-y-auto py-1">
            {list.map((c) => (
              <DropdownItem key={c.id} onClick={() => { close(); void add(c.id, c.name); }}>
                {c.name}
              </DropdownItem>
            ))}
            {list.length === 0 && <p className="px-3.5 py-2 text-xs text-fg-subtle">No collections yet.</p>}
            <DropdownItem onClick={() => { close(); actions.startCreate(); }}>+ New collection</DropdownItem>
          </div>
        )}
      </Dropdown>
      {actions.overlays}
    </>
  );
}

function ActionsColumn({ clip, source, handlers }: { clip: ViewClip; source: ClipsSource; handlers: ClipHandlers }) {
  const { showToast } = useToast();
  const [duplicating, setDuplicating] = useState(false);
  if (!isReady(clip)) return null;
  const base = `/api/projects/${clip.projectId}/clips/${clip.id}`;
  const inUserCollection = source.kind === "collection" && source.id !== FAVORITES_ID;
  return (
    <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start" aria-label={`Actions for ${clipName(clip)}`} role="group">
      <button type="button" className={ACTION} onClick={() => handlers.onOpenWorkspace(clip, "publish")}>
        <IcCalendar /> Publish on social
      </button>
      <a className={ACTION} href={`${base}/export-xml`} download>
        <IcXml /> Export XML
      </a>
      <a className={ACTION} href={`${base}/download`} download>
        <IcDownload /> Download
      </a>
      <button type="button" className={ACTION} onClick={() => handlers.onOpenWorkspace(clip, "edit")}>
        <IcEdit /> Edit clip
      </button>
      <button
        type="button"
        className={ACTION}
        disabled={duplicating}
        onClick={async () => {
          setDuplicating(true);
          try {
            await handlers.onDuplicate(clip);
            showToast("Clip duplicated", "success");
          } catch (e) {
            showToast((e as Error).message, "error");
          } finally {
            setDuplicating(false);
          }
        }}
      >
        <IcCopy /> {duplicating ? "Duplicating…" : "Duplicate"}
      </button>
      <AddToCollection clip={clip} />
      {inUserCollection && handlers.onRemoveFromCollection && (
        <button type="button" className={`${ACTION} text-error`} onClick={() => handlers.onRemoveFromCollection!(clip)}>
          Remove from collection
        </button>
      )}
    </div>
  );
}

export function ClipDetail({
  clip, rank, source, handlers, previewClassName = "",
}: { clip: ViewClip; rank: number; source: ClipsSource; handlers: ClipHandlers; previewClassName?: string }) {
  return (
    <article
      aria-label={`#${rank} ${clipName(clip)}`}
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[96px_200px_minmax(0,1fr)_auto]"
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <ScoreColumn clip={clip} onFeedback={handlers.onFeedback} />
      </div>
      <ClipPreview clip={clip} onChanged={handlers.onChanged} className={`mx-auto max-w-[260px] sm:max-w-none ${previewClassName}`} />
      <div className="min-w-0 space-y-4 lg:contents">
        <TextCard clip={clip} rank={rank} showProject={source.kind === "collection"} />
        <ActionsColumn clip={clip} source={source} handlers={handlers} />
      </div>
    </article>
  );
}
