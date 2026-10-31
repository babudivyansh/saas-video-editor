"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import rs from "./runstate.module.css";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { ScorePerformanceBanner } from "@/app/components/auto-clip/ScorePerformanceBanner";
import { ApiError } from "@/app/dashboard/create/auto-clip/_components/shared";
import { ClipWorkspace, type WorkspaceTab } from "@/app/dashboard/create/auto-clip/_components/ClipWorkspace";
import { activeFilterCount, parseFilters, type ClipFilters } from "@/lib/clip-view";
import { useCollectionMutations } from "../hooks/useCollections";
import { IcDownload, IcFilm, IcFilter, IcGrid, IcList } from "../components/icons";
import { ClipDetail, type ClipHandlers } from "./ClipDetail";
import { ClipGridCard } from "./ClipGridCard";
import { ClipPopup } from "./ClipPopup";
import { FilterPopover } from "./FilterPopover";
import { CollectionGone, ProjectGone, ProjectRunState } from "./RunStates";
import { useClipsSource } from "./useClipsSource";
import {
  SORT_LABELS, isReady, stepClip, visibleClips,
  type ClipLayout, type ClipSort, type ClipsSource, type CollectionClipsResponse, type ProjectClipsResponse, type ViewClip,
} from "./model";

// A project's clips (or a collection's), as OpusClip lays them out: a list
// view of full rows, or a grid of tiles that open a popup; a Filter, a Sort,
// and the clip editor (ClipWorkspace) on top for Edit and Publish.
//
// Everything a link should keep lives in the URL: ?layout=, ?f= and ?len=
// (filters), ?sort=, ?preview= (the grid popup's clip) and ?clip= & ?tab= (the
// editor). The layout is also remembered per browser.

const LAYOUT_KEY = "clipiro:clips-layout";
const SORTS: ClipSort[] = ["score", "order", "duration", "added"];

function readStoredLayout(): ClipLayout | null {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "grid" || v === "list" ? v : null;
  } catch {
    return null;
  }
}

export function ClipsView({ source }: { source: ClipsSource }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const { query, setFeedback, duplicate, refetch } = useClipsSource(source);
  const { removeClips } = useCollectionMutations();

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const layoutParam = params.get("layout");
  const layout: ClipLayout = layoutParam === "grid" ? "grid" : "list";
  // No layout in the URL: restore this browser's last choice, once.
  useEffect(() => {
    if (layoutParam) return;
    if (readStoredLayout() === "grid") setParams({ layout: "grid" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setLayout = (l: ClipLayout) => {
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* private mode: the URL still has it */ }
    setParams({ layout: l, preview: null });
  };

  const filters = parseFilters(params);
  const setFilters = (f: ClipFilters) => setParams({ f: f.flags.join(","), len: f.lengths.join(","), preview: null });
  const defaultSort: ClipSort = source.kind === "project" ? "score" : "added";
  const sortParam = params.get("sort") as ClipSort | null;
  const sort: ClipSort = sortParam && SORTS.includes(sortParam) ? sortParam : defaultSort;

  const data = query.data;
  const all = useMemo(() => data?.clips ?? [], [data]);
  const filterKey = `${filters.flags.join(",")}|${filters.lengths.join(",")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => visibleClips(all, filters, sort), [all, filterKey, sort]);
  const rankOf = (id: string) => shown.findIndex((c) => c.id === id) + 1;

  // The grid popup.
  const previewId = params.get("preview");
  const previewClip = previewId ? shown.find((c) => c.id === previewId) ?? null : null;

  // The editor. Only a rendered clip can be opened in it.
  const workspaceId = params.get("clip");
  const workspaceTab = (params.get("tab") as WorkspaceTab | null) ?? "edit";
  const readyShown = shown.filter(isReady);
  const workspaceIdx = workspaceId ? readyShown.findIndex((c) => c.id === workspaceId) : -1;
  const workspaceClip = workspaceIdx >= 0 ? readyShown[workspaceIdx] : null;

  const handlers: ClipHandlers = {
    onFeedback: (clip, field, value) => {
      setFeedback(clip, field, value).catch((e: Error) => showToast(e.message, "error"));
    },
    onOpenWorkspace: (clip, tab) => setParams({ clip: clip.id, tab, preview: null }),
    onDuplicate: async (clip) => { await duplicate(clip); },
    onChanged: () => void refetch(),
    onRemoveFromCollection:
      source.kind === "collection"
        ? (clip) => {
            removeClips
              .mutateAsync({ id: source.id, clipIds: [clip.id] })
              .then(() => showToast("Removed from the collection", "success"))
              .catch((e: Error) => showToast(e.message, "error"));
          }
        : undefined,
  };

  // A finished run is the "AutoClip worked" moment the review prompt asks at
  // (moved here from the old AutoClip results page). The provider rate-limits.
  const fireReviewPrompt = useReviewPromptTrigger();
  const reviewPromptFired = useRef(false);
  const completedForPrompt = source.kind === "project" && (data as ProjectClipsResponse | undefined)?.project.status === "completed";
  useEffect(() => {
    if (!completedForPrompt || reviewPromptFired.current) return;
    reviewPromptFired.current = true;
    fireReviewPrompt("autoclips_milestone", { featureHint: "auto_clips" }).catch(() => {});
  }, [completedForPrompt, fireReviewPrompt]);

  if (query.error instanceof ApiError && query.error.status === 404) {
    return source.kind === "project" ? <ProjectGone /> : <CollectionGone />;
  }

  const project = source.kind === "project" ? (data as ProjectClipsResponse | undefined)?.project : undefined;
  const collection = source.kind === "collection" ? (data as CollectionClipsResponse | undefined)?.collection : undefined;
  const title = project?.title ?? collection?.name ?? "";
  const heading = source.kind === "project" ? project?.instructions?.trim() || "All clips" : collection?.name ?? "";
  const readyCount = all.filter(isReady).length;
  const renderPct = all.length
    ? Math.round(all.reduce((sum, c) => sum + (c.status === "ready" || c.status === "failed" ? 100 : Math.max(0, Math.min(100, c.progress))), 0) / all.length)
    : 0;
  const filtering = activeFilterCount(filters) > 0;

  if (source.kind === "project" && data) {
    const state = <ProjectRunState projectId={source.id} data={data as ProjectClipsResponse} />;
    // ProjectRunState renders nothing once there are clips to list.
    if (all.length === 0 || (project?.status === "failed" && all.every((c) => c.status === "failed"))) {
      return (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-8">
          <Breadcrumbs items={[{ label: "Your projects", href: "/dashboard/projects" }, { label: title || "Project" }]} />
          {state}
        </div>
      );
    }
  }

  const SEG = "flex h-10 w-10 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 pb-16 pt-6 sm:px-8">
      <Breadcrumbs
        items={[
          { label: "Your projects", href: "/dashboard/projects" },
          { label: title || (source.kind === "project" ? "Project" : "Collection") },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-surface-2 p-1" role="group" aria-label="Layout">
            <button type="button" aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={`${SEG} ${layout === "grid" ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}`}>
              <IcGrid />
            </button>
            <button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={`${SEG} ${layout === "list" ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}`}>
              <IcList />
            </button>
          </div>
          <h1 className="min-w-0 text-base font-medium text-fg sm:text-lg">
            {data ? (
              <span className="line-clamp-2">
                {heading}{" "}
                <span className="whitespace-nowrap text-fg-muted tabular-nums">
                  ({filtering ? `${shown.length} of ${all.length}` : all.length})
                </span>
              </span>
            ) : (
              <Skeleton className="h-6 w-64 rounded" />
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPopover filters={filters} onChange={setFilters} />
          <select
            aria-label="Sort clips"
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value === defaultSort ? null : e.target.value })}
            className="h-10 cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg outline-none focus:border-primary/60"
          >
            {SORTS.filter((s) => s !== "added" || source.kind === "collection").map((s) => (
              <option key={s} value={s}>{SORT_LABELS[s]}</option>
            ))}
          </select>
          {source.kind === "project" && readyCount > 0 && (
            <>
              <Link
                href={`/dashboard/projects/${source.id}/review`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-on-primary outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Review clips
              </Link>
              <Link
                href={`/dashboard/projects/${source.id}/share`}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Post or download
              </Link>
            </>
          )}
          {source.kind === "project" && readyCount > 1 && (
            <a
              href={`/api/projects/${source.id}/clips/download-all`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <IcDownload /> Download all ({readyCount})
            </a>
          )}
        </div>
      </div>

      {project?.status === "completed" && <ScorePerformanceBanner />}
      {project && project.status !== "completed" && project.status !== "failed" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-fg-muted">
            {readyCount} of {all.length} clips ready. The rest appear here as they finish.
          </p>
          {/* Real progress: the average of the clips' own render progress. */}
          <div className={rs.bar} aria-hidden="true"><i style={{ width: `${renderPct}%` }} /></div>
        </div>
      )}

      {query.error && !(query.error instanceof ApiError && query.error.status === 404) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          <span>Couldn&rsquo;t load these clips. {(query.error as Error).message}</span>
          <button type="button" onClick={() => void refetch()} className="rounded-full border border-error/40 px-3 py-1 text-xs font-semibold outline-none hover:bg-error/10 focus-visible:ring-2 focus-visible:ring-error/60">Try again</button>
        </div>
      )}

      {!data && !query.error && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />)}
        </div>
      )}

      {data && all.length === 0 && source.kind === "collection" && (
        <div className="mx-auto mt-8 max-w-md">
          <EmptyState
            icon={<IcFilm />}
            title={collection?.builtIn ? "No favorites yet" : "This collection is empty"}
            subtitle={collection?.builtIn ? "Heart a clip on any project and it shows up here." : "Use “Add to collection” on any clip to put it here."}
            action={{ label: "Go to your projects", href: "/dashboard/projects" }}
          />
        </div>
      )}

      {data && all.length > 0 && shown.length === 0 && (
        <div className="mx-auto mt-8 max-w-md">
          <EmptyState
            icon={<IcFilter />}
            title="No clips match these filters"
            subtitle="Untick a filter to see more clips."
            action={{ label: "Clear filters", onClick: () => setFilters({ flags: [], lengths: [] }) }}
          />
        </div>
      )}

      {shown.length > 0 && layout === "list" && (
        <ol className="space-y-10" aria-label="Clips">
          {shown.map((clip, i) => (
            <li key={clip.id}>
              <ClipDetail clip={clip} rank={i + 1} source={source} handlers={handlers} />
            </li>
          ))}
        </ol>
      )}

      {shown.length > 0 && layout === "grid" && (
        <ol className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-label="Clips">
          {shown.map((clip) => (
            <li key={clip.id}>
              <ClipGridCard clip={clip} handlers={handlers} onOpen={() => setParams({ preview: clip.id })} />
            </li>
          ))}
        </ol>
      )}

      <ClipPopup
        clip={previewClip}
        rank={previewClip ? rankOf(previewClip.id) : 0}
        total={shown.length}
        source={source}
        handlers={handlers}
        onStep={(d) => { if (previewClip) setParams({ preview: stepClip(shown, previewClip.id, d) }); }}
        onClose={() => setParams({ preview: null })}
      />

      {workspaceClip && (
        <ClipWorkspace
          key={workspaceClip.id}
          projectId={workspaceClip.projectId}
          clip={workspaceClip}
          transcriptionFailed={project?.warnings?.includes("transcription_failed") ?? false}
          initialTab={workspaceTab}
          expandOrigin="50% 50%"
          index={workspaceIdx}
          total={readyShown.length}
          onPrev={() => setParams({ clip: stepClip(readyShown, workspaceClip.id, -1), tab: null })}
          onNext={() => setParams({ clip: stepClip(readyShown, workspaceClip.id, 1), tab: null })}
          onClose={() => setParams({ clip: null, tab: null })}
          onChanged={() => void refetch()}
          onOpenSibling={(id) => setParams({ clip: id, tab: null })}
          siblingClipIds={readyShown.filter((c) => c.id !== workspaceClip.id && c.projectId === workspaceClip.projectId).map((c) => c.id)}
        />
      )}
    </div>
  );
}

export type { ViewClip };
