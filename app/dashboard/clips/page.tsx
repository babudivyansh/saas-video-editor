"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { ProjectStatusBadge } from "@/app/components/dashboard/ProjectStatusBadge";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import { CardMenuButton } from "@/app/components/dashboard/CardMenuButton";
import { useProjectActions } from "@/app/components/dashboard/useProjectActions";
import { ClipCard } from "./components/ClipCard";
import {
  useClipsLibrary, useClipMutations,
  type ClipFilters, type ClipRow, type ClipSort,
} from "./hooks/useClipsLibrary";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  progress: number;
  createdAt: string;
  _count: { clips: number };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function IcPlus() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}

// Card cover gradients cycle so the project grid reads colorful without thumbnails.
const COVER_GRADIENTS = [
  "from-brand to-accent-violet",
  "from-accent-violet to-accent-fuchsia",
  "from-accent-fuchsia to-accent-pink",
  "from-emerald-bright to-brand",
  "from-fuchsia-400 to-accent-violet",
  "from-emerald-bright to-emerald-bright",
];

const ACTIVE_STATUSES = ["draft", "analyzing", "pending_review", "rendering"];

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
  { id: "pending_review", label: "Awaiting review" },
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

type Tab = "clips" | "projects";

function ClipsLibraryPageInner() {
  const [tab, setTab] = useState<Tab>("clips");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">My Clips</h1>
          <p className="text-sm text-ink-soft mt-1">
            Every clip AutoClip has cut for you, newest first.
          </p>
        </div>
        <Button variant="primary" size="md" href="/dashboard/create/auto-clip" icon={<IcPlus />}>
          New AutoClip
        </Button>
      </div>

      {/* This page was called "My Clips" but listed projects and never rendered
          a single clip — the clips themselves had no home anywhere in the app.
          Clips are the default view now; projects stay available as a tab. */}
      <div className="flex items-center gap-1 p-1 rounded-full bg-surface w-fit">
        {(["clips", "projects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`text-xs font-bold px-4 py-1.5 rounded-full transition-colors ${
              tab === t ? "bg-panel text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t === "clips" ? "Clips" : "Projects"}
          </button>
        ))}
      </div>

      {tab === "clips" ? <ClipsTab /> : <ProjectsTab />}
    </div>
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
  const { clips, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useClipsLibrary(filters);
  const mutations = useClipMutations();

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {CLIP_STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatus(f.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                status === f.id
                  ? "grad-brand text-on-primary shadow-glow"
                  : "bg-panel border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setFavorite((v) => !v)}
            aria-pressed={favorite}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              favorite
                ? "bg-tint-amber text-amber-700 border border-amber-200"
                : "bg-panel border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
            }`}
          >
            ★ Starred
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ClipSort)}
            aria-label="Sort clips"
            className="text-xs font-semibold px-3 py-2 rounded-full bg-panel border border-card-border text-ink-soft outline-none focus:border-violet-300 cursor-pointer"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="relative sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/50"><IcSearch /></span>
            <input
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Search clips…"
              className="w-full text-sm bg-panel border border-card-border rounded-full pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
            />
          </div>
        </div>
      </div>

      {/* A failed request is now visibly a failure. The old page swallowed
          non-2xx responses and rendered the "nothing here yet" empty state. */}
      {error && (
        <div className="rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          We couldn&apos;t load your clips. {(error as Error).message}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-card)] bg-gray-200/60 animate-pulse aspect-[9/16]" />
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
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onToggleFavorite={() =>
                  mutations.toggleFavorite.mutate({
                    projectId: clip.projectId,
                    clipId: clip.id,
                    isFavorite: !clip.isFavorite,
                  })
                }
                onMenu={(e) => menu.show(e, clip)}
              />
            ))}
          </div>

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
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
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const projectsQuery = useQuery({
    queryKey: ["projects", "auto-clip"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await fetch("/api/projects?productType=auto-clip", {
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
    // API returns newest-first; flip a copy for oldest-first.
    return sort === "newest" ? rows : rows.slice().reverse();
  }, [projects, filter, query, sort]);

  const countFor = (id: FilterId) => projects?.filter((p) => matchesFilter(p, id)).length ?? 0;

  return (
    <div className="space-y-5">
      {projects && projects.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PROJECT_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  filter === f.id
                    ? "grad-brand text-on-primary shadow-glow"
                    : "bg-panel border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
                }`}
              >
                {f.label} <span className={filter === f.id ? "text-white/70" : "text-ink-soft/60"}>({countFor(f.id)})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
              title="Toggle sort order"
              className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-panel border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4"/></svg>
              {sort === "newest" ? "Newest" : "Oldest"}
            </button>
            <div className="relative sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/50"><IcSearch /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="w-full text-sm bg-panel border border-card-border rounded-full pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {projectsQuery.error && (
        <div className="rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          We couldn&apos;t load your projects. {(projectsQuery.error as Error).message}
        </div>
      )}

      {!projects && !projectsQuery.error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-52 rounded-[var(--radius-card)] bg-gray-200/60 animate-pulse" />)}
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
        <EmptyState
          icon={<IcSearch />}
          title="No projects match"
          subtitle="Try a different filter or search term."
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p, i) => (
            <Card
              key={p.id}
              href={`/dashboard/create/auto-clip?project=${p.id}`}
              className="group relative hover:border-violet-200"
            >
              <CardMenuButton
                label="Project actions"
                onClick={(e) => projectActions.openMenu(e, { id: p.id, title: p.title })}
              />
              <div className={`relative h-24 bg-gradient-to-br ${COVER_GRADIENTS[i % COVER_GRADIENTS.length]} flex items-end p-3 overflow-hidden`}>
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                <span className="relative inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/25 backdrop-blur-sm rounded-full px-2.5 py-1">
                  <IcFilm /> {p._count.clips} clip{p._count.clips === 1 ? "" : "s"}
                </span>
              </div>
              <div className="p-4 flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-ink line-clamp-2 group-hover:text-brand transition-colors">{p.title}</p>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-ink-soft">{fmtDate(p.createdAt)}</p>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.status === "rendering" && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-1 bg-surface-3 rounded-full flex-1 overflow-hidden">
                      <div className="h-full grad-brand rounded-full transition-all duration-500" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-ink-soft">{p.progress}%</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {projectActions.overlays}
    </div>
  );
}
