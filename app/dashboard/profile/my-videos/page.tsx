"use client";

// Relocated from the old profile page's "My Videos" tab — same filters, grid,
// hover-preview, and download/copy/delete actions, no behavior changes.

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { ProductBadge } from "@/app/components/dashboard/ProductBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

function IcVideo() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>; }
function IcVideoLg() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>; }
function IcDownload() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>; }
function IcTrash() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></svg>; }
function IcEye() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>; }
function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }
function IcSpinner() { return <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />; }

interface Project {
  id: string;
  title: string;
  productType: string;
  status: string;
  videoUrl: string | null;
  uploadedVideoUrl: string | null;
  backgroundUrl: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-tint-emerald text-green-700",
  rendering: "bg-tint-violet text-accent-violet",
  failed: "bg-red-100 text-red-600",
  draft: "bg-gray-100 text-gray-500",
};

function VideoCard({ project, token, onDelete }: { project: Project; token: string; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDelete(project.id);
    } finally {
      setDeleting(false);
    }
  }

  function handleCopy() {
    if (!project.videoUrl) return;
    navigator.clipboard.writeText(project.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const thumb = project.backgroundUrl ? project.backgroundUrl.replace("/video.mp4", "/thumbnail.webp") : null;

  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-card-border overflow-hidden transition-all hover:shadow-card-hover hover:-translate-y-0.5">
      <div className="relative bg-gray-50" style={{ paddingBottom: "56.25%" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={project.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-soft/40">
            <IcVideo />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[project.status] ?? STATUS_STYLES.draft}`}>
            {project.status === "rendering" ? "⏳ Rendering" : project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
        </div>
        {project.status === "completed" && project.videoUrl && (
          <a href={project.videoUrl} target="_blank" rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-ink ml-0.5"><path d="M5 3l14 9-14 9V3z" /></svg>
            </div>
          </a>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{project.title}</p>
          <ProductBadge type={project.productType} />
        </div>
        <p className="text-xs text-ink-soft/70 mb-3">{formatDate(project.createdAt)}</p>

        <div className="flex items-center gap-2">
          {project.status === "completed" && project.videoUrl ? (
            <>
              <a href={project.videoUrl} download
                className="flex-1 flex items-center justify-center gap-1.5 grad-brand hover:brightness-105 text-white text-xs font-semibold py-2 rounded-full transition-all">
                <IcDownload /> Download
              </a>
              <button onClick={handleCopy} title="Copy link"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-card-border hover:bg-tint-blue text-ink-soft transition-colors cursor-pointer">
                {copied ? <IcCheck /> : <IcCopy />}
              </button>
              <a href={project.videoUrl} target="_blank" rel="noopener noreferrer" title="Preview"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-card-border hover:bg-tint-blue text-ink-soft transition-colors">
                <IcEye />
              </a>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-2 text-xs text-ink-soft py-1">
              {project.status === "rendering" && <IcSpinner />}
              <span>{project.status === "rendering" ? "Processing your video…" : project.status === "failed" ? "Generation failed" : "Draft — not generated yet"}</span>
            </div>
          )}
          <button onClick={handleDelete} disabled={deleting} title="Delete"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-card-border hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-ink-soft/60 transition-colors flex-shrink-0 cursor-pointer">
            {deleting ? <IcSpinner /> : <IcTrash />}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "split-screen", label: "Split Screen" },
  { id: "streamer-video", label: "Streamer" },
  { id: "reddit-video", label: "Reddit Story" },
  { id: "text-video", label: "Fake Text" },
];

export default function MyVideosPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = (await res.json()) as { projects: Project[] };
        setProjects(data.projects);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filtered = filter === "all" ? projects : projects.filter((p) => p.productType === filter);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold grad-text inline-block">My Videos</h1>

      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
              filter === f.id
                ? "grad-brand text-white shadow-glow"
                : "bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
            }`}>
            {f.label}
            {f.id === "all" && <span className="ml-1.5 text-[10px] opacity-70">{projects.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-ink-soft">
          <IcSpinner /> <span className="text-sm">Loading your videos…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IcVideoLg />}
          title="No videos yet"
          subtitle="Generate your first video to see it here."
          action={{ label: "Create a video", href: "/dashboard" }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <VideoCard key={p.id} project={p} token={token!} onDelete={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
