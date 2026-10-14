"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Tabs } from "@/app/components/ui/Tabs";
import { ToastProvider } from "@/app/components/ui/Toast";
import { useProjectActions } from "@/app/components/dashboard/useProjectActions";
import { CollectionsGrid } from "./components/CollectionsGrid";
import { useCollectionActions } from "./components/CollectionActions";
import { ProjectCard, UploadTile, type ProjectCardRow } from "./components/ProjectGrid";
import { IcFilm, IcPlus, IcSearch } from "./components/icons";
import { authedFetch, useCollections } from "./hooks/useCollections";

// Your projects: the clip collections, then every AutoClip run as a card.
// Opening a project goes to its clips page; a collection, to the clips in it.

type Sort = "newest" | "oldest" | "clips";
const RUNNING = new Set(["analyzing", "rendering"]);

// ToastProvider is not global in this app — each page that needs toasts wraps
// itself (see app/dashboard/social-tracker/layout.tsx).
export default function ProjectsPage() {
  return (
    <ToastProvider>
      <ProjectsPageInner />
    </ToastProvider>
  );
}

function ProjectsPageInner() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const projectsQuery = useQuery({
    queryKey: ["projects", "auto-clip", "cover"],
    queryFn: async () =>
      (await authedFetch<{ projects: ProjectCardRow[] }>(token, "/api/projects?productType=auto-clip&cover=1")).projects ?? [],
    enabled: !!user,
    staleTime: 30_000,
    // A run in progress moves on its own; keep its card's status current.
    refetchInterval: (q) => (q.state.data?.some((p) => RUNNING.has(p.status)) ? 5_000 : false),
  });
  const projects = projectsQuery.data;
  const collectionsQuery = useCollections();
  const collectionActions = useCollectionActions();

  const projectActions = useProjectActions({
    labels: {
      rename: "Rename",
      delete: "Delete",
      renameTitle: "Rename project",
      renameMessage: "Give this project a new name.",
      renameConfirm: "Save",
      deleteTitle: "Delete project?",
      deleteMessage: (title) => `“${title}” and all its clips will be permanently deleted. This can't be undone.`,
      deleteConfirm: "Delete",
      deleted: "Project deleted",
      renamed: "Project renamed",
      failed: "That didn't work. Try again.",
    },
    onDeleted: () => void projectsQuery.refetch(),
    onRenamed: () => void projectsQuery.refetch(),
  });

  const shown = useMemo(() => {
    if (!projects) return undefined;
    const q = query.trim().toLowerCase();
    const rows = q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : projects;
    // The API returns newest first.
    if (sort === "oldest") return rows.slice().reverse();
    if (sort === "clips") return rows.slice().sort((a, b) => b._count.clips - a._count.clips);
    return rows;
  }, [projects, query, sort]);

  const collectionCount = (collectionsQuery.data?.collections.length ?? 0) + 1; // + Favorites

  const collectionsSection = (
    <section aria-labelledby="collections-heading" className="space-y-3">
      <h2 id="collections-heading" className="text-sm font-medium text-fg-muted">Collections</h2>
      {collectionsQuery.error && (
        <p role="alert" className="text-sm text-error">
          Couldn&rsquo;t load your collections. {(collectionsQuery.error as Error).message}
        </p>
      )}
      <CollectionsGrid
        data={collectionsQuery.data}
        loading={collectionsQuery.isLoading}
        onNew={collectionActions.startCreate}
        onMenu={collectionActions.openMenu}
      />
    </section>
  );

  const projectsSection = (
    <section aria-labelledby="projects-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="projects-heading" className="text-sm font-medium text-fg-muted">Projects</h2>
        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"><IcSearch /></span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-4 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort projects"
              className="h-10 cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg outline-none focus:border-primary/60"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="clips">Most clips</option>
            </select>
          </div>
        )}
      </div>

      {projectsQuery.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          <span>Couldn&rsquo;t load your projects. {(projectsQuery.error as Error).message}</span>
          <button
            type="button"
            onClick={() => void projectsQuery.refetch()}
            className="rounded-full border border-error/40 px-3 py-1 text-xs font-semibold text-error outline-none hover:bg-error/10 focus-visible:ring-2 focus-visible:ring-error/60"
          >
            Try again
          </button>
        </div>
      )}

      {!projects && !projectsQuery.error && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video rounded-2xl" />
              <Skeleton className="h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="mx-auto mt-6 max-w-md">
          <EmptyState
            icon={<IcFilm />}
            title="Start your first project"
            subtitle="Upload a long video and AutoClip cuts it into short clips ready to post."
            action={{ label: "Upload a video", href: "/dashboard/create/auto-clip" }}
          />
        </div>
      )}

      {shown && projects && projects.length > 0 && (
        <>
          {shown.length === 0 && <p className="py-6 text-sm text-fg-muted">No projects match “{query.trim()}”.</p>}
          <ul className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Projects">
            {!query.trim() && (
              <li>
                <UploadTile />
              </li>
            )}
            {shown.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} onMenu={(e) => projectActions.openMenu(e, { id: p.id, title: p.title })} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 pt-6 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Your projects</h1>
        <Button variant="primary" size="md" href="/dashboard/create/auto-clip" icon={<IcPlus />}>
          New AutoClip
        </Button>
      </div>

      <Tabs
        label="Show"
        activeId={tab}
        onChange={setTab}
        items={[
          {
            id: "all",
            label: "All",
            content: (
              <div className="space-y-10">
                {collectionsSection}
                {projectsSection}
              </div>
            ),
          },
          { id: "collections", label: "Collections", badge: `(${collectionCount})`, content: collectionsSection },
          { id: "projects", label: "Projects", badge: `(${projects?.length ?? 0})`, content: projectsSection },
        ]}
      />
      {collectionActions.overlays}
      {projectActions.overlays}
    </div>
  );
}
