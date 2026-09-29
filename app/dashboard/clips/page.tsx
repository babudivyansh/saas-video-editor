"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import { useProjectActions } from "@/app/components/dashboard/useProjectActions";
import { Tabs } from "@/app/components/ui/Tabs";
import { useIsWideLayout } from "@/app/components/dashboard/useIsWideLayout";
import { ClipList } from "./components/ClipList";
import { ClipInspector } from "./components/ClipInspector";
import { IcStar, clipHref } from "./components/clipUi";
import { ProjectList } from "./components/ProjectList";
import { ProjectInspector } from "./components/ProjectInspector";
import { ACTIVE_STATUSES, projectHref, type ProjectRow } from "./components/projectUi";
import {
  useClipsLibrary, useClipMutations,
  type ClipFilters, type ClipRow, type ClipSort,
} from "./hooks/useClipsLibrary";

function IcPlus() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}

const PROJECT_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
] as const;
type FilterId = (typeof PROJECT_FILTERS)[number]["id"];

function matchesFilter(p: ProjectRow, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.includes(p.status);
  return p.status === filter;
}

// Clip-level status filters. "Awaiting review" is included because a clip that
// is still pending is genuinely something the user has to act on.
const CLIP_STATUS_FILTERS: { id: string | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "ready", label: "Ready" },
  { id: "rendering", label: "Rendering" },
  { id: "failed", label: "Failed" },
];

const SORTS: { id: ClipSort; label: string }[] = [
  { id: "date", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "score", label: "Best first" },
  { id: "duration", label: "Longest" },
];

// ToastProvider is not global in this app — each page that needs toasts wraps
// itself (see app/dashboard/social-tracker/layout.tsx).
export default function ClipsLibraryPage() {
  return (
    <ToastProvider>
      <ClipsLibraryPageInner />
    </ToastProvider>
  );
}

function ClipsLibraryPageInner() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 pt-6 pb-12 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Library</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-fg">My Clips</h1>
          <p className="text-sm text-fg-muted mt-1.5">
            Every clip AutoClip has cut for you. Pick one to preview it.
          </p>
        </div>
        <Button variant="primary" size="md" href="/dashboard/create/auto-clip" icon={<IcPlus />}>
          New AutoClip
        </Button>
      </div>

      {/* Clips are the default view; projects stay available as a tab. */}
      <Tabs
        label="Library view"
        items={[
          { id: "clips", label: "Clips", content: <ClipsTab /> },
          { id: "projects", label: "Projects", content: <ProjectsTab /> },
        ]}
      />
    </div>
  );
}

function SegButton({
  active, onClick, pressed, children,
}: { active: boolean; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed ?? active}
      className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
        active ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// ── Clips ────────────────────────────────────────────────────────────────────

function ClipsTab() {
  const { showToast } = useToast();
  const [rawQuery, setRawQuery] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<ClipSort>("date");
  const [favorite, setFavorite] = useState(false);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const filters: ClipFilters = useMemo(() => ({ q, status, sort, favorite }), [q, status, sort, favorite]);
  const { clips, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } =
    useClipsLibrary(filters);
  const mutations = useClipMutations({ onError: (message) => showToast(message, "error") });

  const menu = useContextMenu<ClipRow>();
  const [renaming, setRenaming] = useState<ClipRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ClipRow | null>(null);

  const filtersActive = !!q || !!status || favorite;

  async function runRename() {
    const target = renaming;
    const title = renameValue.trim();
    setRenaming(null);
    if (!target || !title) return;
    try {
      await mutations.rename.mutateAsync({ projectId: target.projectId, clipId: target.id, title });
      showToast("Clip renamed");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function runDelete() {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await mutations.remove.mutateAsync({ projectId: target.projectId, clipId: target.id });
      showToast("Clip deleted");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  const router = useRouter();
  const isWide = useIsWideLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Fall back to the first clip whenever the selection is gone — first load,
  // a filter that hid it, or a delete.
  const selected = clips.find((c) => c.id === selectedId) ?? clips[0] ?? null;

  // Rank by score among what is loaded. Only claimed when every clip is
  // loaded; "#2 of 30" would be a lie with more pages still on the server.
  const rank = useMemo(() => {
    if (!selected || typeof selected.score !== "number" || hasNextPage) return null;
    return 1 + clips.filter((c) => (c.score ?? -1) > selected.score!).length;
  }, [clips, selected, hasNextPage]);

  function toggleFavorite(clip: ClipRow) {
    mutations.toggleFavorite.mutate({ projectId: clip.projectId, clipId: clip.id, isFavorite: !clip.isFavorite });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 p-1 rounded-full bg-surface-2 border border-line w-fit flex-wrap" role="group" aria-label="Filter clips">
          {CLIP_STATUS_FILTERS.map((f) => (
            <SegButton key={f.label} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</SegButton>
          ))}
          <SegButton active={favorite} onClick={() => setFavorite((v) => !v)} pressed={favorite}>
            <IcStar filled={favorite} className="w-3.5 h-3.5" /> Starred
          </SegButton>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"><IcSearch /></span>
            <input
              type="search"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Search clips"
              aria-label="Search clips"
              className="w-full h-10 text-sm bg-surface-2 border border-line rounded-xl pl-10 pr-4 text-fg placeholder:text-fg-subtle outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ClipSort)}
            aria-label="Sort clips"
            className="h-10 text-sm px-3 rounded-xl bg-surface-2 border border-line text-fg outline-none focus:border-primary/60 cursor-pointer"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* A failed request is visibly a failure, never the "nothing here yet"
          empty state. */}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          <span>We couldn&apos;t load your clips. {(error as Error).message}</span>
          <button type="button" onClick={() => void refetch()} className="ml-3 rounded-full border border-error/40 px-3 py-1 text-xs font-semibold text-error hover:bg-error/10 outline-none focus-visible:ring-2 focus-visible:ring-error/60">Try again</button>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-2xl bg-surface-2 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !error && clips.length === 0 && (
        <div className="max-w-md mx-auto mt-10">
          <EmptyState
            icon={filtersActive ? <IcSearch /> : <IcFilm />}
            title={filtersActive ? "No clips match" : "No clips yet"}
            subtitle={
              filtersActive
                ? "Try a different filter or search term."
                : "Drop in a long video and AutoClip will cut it into viral-ready clips."
            }
            action={filtersActive ? undefined : { label: "Create your first one", href: "/dashboard/create/auto-clip" }}
          />
        </div>
      )}

      {clips.length > 0 && (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="min-w-0 space-y-4">
            <ClipList
              clips={clips}
              selectedId={isWide ? selected?.id ?? null : null}
              // No room for the preview panel below xl, so a row opens the
              // clip itself — what the old grid card did.
              onSelect={(clip) => (isWide ? setSelectedId(clip.id) : router.push(clipHref(clip)))}
              onToggleFavorite={toggleFavorite}
              onMenu={(e, clip) => menu.show(e, clip)}
            />
            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>

          {isWide && selected && (
            <div className="sticky top-6">
              <ClipInspector
                clip={selected}
                rank={rank}
                total={clips.length}
                onToggleFavorite={() => toggleFavorite(selected)}
                onRename={() => { setRenameValue(selected.title ?? ""); setRenaming(selected); }}
                onDelete={() => setDeleting(selected)}
              />
            </div>
          )}
        </div>
      )}

      <ContextMenu open={menu.open} x={menu.x} y={menu.y} onClose={menu.close}>
        {menu.data && (
          <>
            <ContextMenuItem
              onClick={() => {
                setRenameValue(menu.data!.title ?? "");
                setRenaming(menu.data!);
                menu.close();
              }}
            >
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                mutations.toggleFavorite.mutate({
                  projectId: menu.data!.projectId,
                  clipId: menu.data!.id,
                  isFavorite: !menu.data!.isFavorite,
                });
                menu.close();
              }}
            >
              {menu.data.isFavorite ? "Remove star" : "Star this clip"}
            </ContextMenuItem>
            <ContextMenuItem danger onClick={() => { setDeleting(menu.data!); menu.close(); }}>
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      <ConfirmDialog
        open={!!renaming}
        title="Rename clip"
        message="Give this clip a new title. This is metadata only — nothing is re-rendered and no credits are spent."
        confirmLabel="Save"
        confirmDisabled={!renameValue.trim()}
        onClose={() => setRenaming(null)}
        onConfirm={runRename}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim()) void runRename(); }}
          className="w-full rounded-xl border border-card-border px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleting}
        danger
        title="Delete clip?"
        message={`“${deleting?.title || `Clip ${(deleting?.index ?? 0) + 1}`}” will be permanently deleted. The other clips in this project are not affected.`}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={runDelete}
      />
    </div>
  );
}

// ── Projects (the previous behaviour of this page, kept as a tab) ────────────

function ProjectsTab() {
  const { token, user } = useAuth();
  const router = useRouter();
  const isWide = useIsWideLayout();
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "clips">("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "auto-clip", "cover"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await fetch("/api/projects?productType=auto-clip&cover=1", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()).projects ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
  const projects = projectsQuery.data ?? null;

  const projectActions = useProjectActions({
    labels: {
      rename: "Rename",
      delete: "Delete",
      renameTitle: "Rename",
      renameMessage: "Give this project a new name.",
      renameConfirm: "Save",
      deleteTitle: "Delete project?",
      deleteMessage: (title) => `“${title}” and everything in it will be permanently deleted. This cannot be undone.`,
      deleteConfirm: "Delete",
      deleted: "Project deleted",
      renamed: "Project renamed",
      failed: "That didn't work. Please try again.",
    },
    onDeleted: () => projectsQuery.refetch(),
    onRenamed: () => projectsQuery.refetch(),
  });

  const filtered = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    const rows = projects.filter((p) => matchesFilter(p, filter) && (!q || p.title.toLowerCase().includes(q)));
    // API returns newest-first.
    if (sort === "oldest") return rows.slice().reverse();
    if (sort === "clips") return rows.slice().sort((a, b) => b._count.clips - a._count.clips);
    return rows;
  }, [projects, filter, query, sort]);

  const countFor = (id: FilterId) => projects?.filter((p) => matchesFilter(p, id)).length ?? 0;
  const selected = filtered ? filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null : null;

  return (
    <div className="space-y-5">
      {projects && projects.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 p-1 rounded-full bg-surface-2 border border-line w-fit flex-wrap" role="group" aria-label="Filter projects">
            {PROJECT_FILTERS.map((f) => (
              <SegButton key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className={filter === f.id ? "text-fg-muted" : "text-fg-subtle"}>{countFor(f.id)}</span>
              </SegButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"><IcSearch /></span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="w-full h-10 text-sm bg-surface-2 border border-line rounded-xl pl-10 pr-4 text-fg placeholder:text-fg-subtle outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Sort projects"
              className="h-10 text-sm px-3 rounded-xl bg-surface-2 border border-line text-fg outline-none focus:border-primary/60 cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="clips">Most clips</option>
            </select>
          </div>
        </div>
      )}

      {projectsQuery.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          <span>We couldn&apos;t load your projects. {(projectsQuery.error as Error).message}</span>
          <button type="button" onClick={() => void projectsQuery.refetch()} className="ml-3 rounded-full border border-error/40 px-3 py-1 text-xs font-semibold text-error hover:bg-error/10 outline-none focus-visible:ring-2 focus-visible:ring-error/60">Try again</button>
        </div>
      )}

      {!projects && !projectsQuery.error && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[80px] rounded-2xl bg-surface-2 animate-pulse" />)}
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="max-w-md mx-auto mt-12">
          <EmptyState
            icon={<IcFilm />}
            title="No AutoClip projects yet"
            subtitle="Drop in a long video and let AutoClip cut it into viral-ready clips."
            action={{ label: "Create your first one", href: "/dashboard/create/auto-clip" }}
          />
        </div>
      )}

      {projects && projects.length > 0 && filtered && filtered.length === 0 && (
        <EmptyState icon={<IcSearch />} title="No projects match" subtitle="Try a different filter or search term." />
      )}

      {filtered && filtered.length > 0 && (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="min-w-0">
            <ProjectList
              projects={filtered}
              selectedId={isWide ? selected?.id ?? null : null}
              // Below xl there is no panel, so a row opens the project, as
              // the old card did.
              onSelect={(p) => (isWide ? setSelectedId(p.id) : router.push(projectHref(p)))}
              onMenu={(e, p) => projectActions.openMenu(e, { id: p.id, title: p.title })}
            />
          </div>
          {isWide && selected && (
            <div className="sticky top-6">
              <ProjectInspector
                project={selected}
                onRename={() => projectActions.startRename({ id: selected.id, title: selected.title })}
                onDelete={() => projectActions.startDelete({ id: selected.id, title: selected.title })}
              />
            </div>
          )}
        </div>
      )}
      {projectActions.overlays}
    </div>
  );
}
