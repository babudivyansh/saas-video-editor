"use client";
import { useEffect, useMemo, useState } from "react";
import { getStoredToken } from "@/app/hooks/useVideoGenerate";
import { ProjectStatusBadge } from "@/app/components/dashboard/ProjectStatusBadge";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { ToastProvider } from "@/app/components/ui/Toast";
import { CardMenuButton } from "@/app/components/dashboard/CardMenuButton";
import { useProjectActions } from "@/app/components/dashboard/useProjectActions";

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

// Card cover gradients cycle so the grid reads colorful without thumbnails.
const COVER_GRADIENTS = [
  "from-brand to-accent-violet",
  "from-accent-violet to-accent-fuchsia",
  "from-accent-fuchsia to-accent-pink",
  "from-indigo-400 to-brand",
  "from-fuchsia-400 to-accent-violet",
  "from-blue-400 to-indigo-600",
];

const ACTIVE_STATUSES = ["draft", "analyzing", "pending_review", "rendering"];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function matchesFilter(p: ProjectRow, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.includes(p.status);
  return p.status === filter;
}

// AutoClip project history (P1.5) — GET /api/projects already returned past
// projects, this is just the missing UI surface for browsing back into them.
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
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  // This page was entirely read-only — no way to rename or remove a project
  // anywhere in the app except the separate My Videos list.
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
    onDeleted: (id) => setProjects((prev) => (prev ? prev.filter((p) => p.id !== id) : prev)),
    onRenamed: (id, title) =>
      setProjects((prev) => (prev ? prev.map((p) => (p.id === id ? { ...p, title } : p)) : prev)),
  });

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetch("/api/projects?productType=auto-clip", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setError("Failed to load your clips"));
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    const rows = projects.filter((p) => matchesFilter(p, filter) && (!q || p.title.toLowerCase().includes(q)));
    // API returns newest-first; flip a copy for oldest-first.
    return sort === "newest" ? rows : rows.slice().reverse();
  }, [projects, filter, query, sort]);

  const countFor = (id: FilterId) => projects?.filter((p) => matchesFilter(p, id)).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold grad-text inline-block">My Clips</h1>
          <p className="text-sm text-ink-soft mt-1">All your AutoClip projects in one place — jump back into any of them.</p>
        </div>
        <Button variant="primary" size="md" href="/dashboard/create/auto-clip" icon={<IcPlus />}>
          New AutoClip
        </Button>
      </div>

      {/* ── Toolbar: status filters + search ── */}
      {projects && projects.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  filter === f.id
                    ? "grad-brand text-white shadow-glow"
                    : "bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
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
              className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors whitespace-nowrap"
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
                className="w-full text-sm bg-white border border-card-border rounded-full pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── Loading skeleton ── */}
      {!projects && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-52 rounded-[var(--radius-card)] bg-gray-200/60 animate-pulse" />)}
        </div>
      )}

      {/* ── Empty: no projects at all ── */}
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

      {/* ── Empty: no matches for filter/search ── */}
      {projects && projects.length > 0 && filtered && filtered.length === 0 && (
        <EmptyState
          icon={<IcSearch />}
          title="No projects match"
          subtitle="Try a different filter or search term."
        />
      )}

      {/* ── Project grid ── */}
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
              {/* Cover */}
              <div className={`relative h-24 bg-gradient-to-br ${COVER_GRADIENTS[i % COVER_GRADIENTS.length]} flex items-end p-3 overflow-hidden`}>
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                <span className="relative inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/25 backdrop-blur-sm rounded-full px-2.5 py-1">
                  <IcFilm /> {p._count.clips} clip{p._count.clips === 1 ? "" : "s"}
                </span>
              </div>
              {/* Body */}
              <div className="p-4 flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-ink line-clamp-2 group-hover:text-brand transition-colors">{p.title}</p>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-ink-soft">{fmtDate(p.createdAt)}</p>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.status === "rendering" && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-1 bg-gray-100 rounded-full flex-1 overflow-hidden">
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
