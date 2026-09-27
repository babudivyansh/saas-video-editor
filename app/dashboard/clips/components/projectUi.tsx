"use client";

import { STATUS_LABEL } from "@/app/components/dashboard/ProjectStatusBadge";

export interface ProjectRow {
  id: string;
  title: string;
  status: string;
  progress: number;
  createdAt: string;
  failureReason?: string | null;
  /** First rendered clip's thumbnail, signed. Only with ?cover=1. */
  coverUrl?: string | null;
  /** The uploaded source video, signed. Only with ?cover=1. */
  sourceUrl?: string | null;
  _count: { clips: number };
}

export const ACTIVE_STATUSES = ["draft", "analyzing", "rendering"];

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function projectHref(p: ProjectRow): string {
  return `/dashboard/create/auto-clip?project=${p.id}`;
}

export function clipCountLabel(n: number): string {
  return n === 1 ? "1 clip" : `${n} clips`;
}

/** Dark-theme status chip, matching ClipStatusChip. */
export function ProjectStatusChip({ project }: { project: ProjectRow }) {
  const s = project.status;
  const tone =
    s === "completed" ? "bg-success/10 text-success"
      : s === "failed" ? "bg-error/10 text-error"
        : s === "draft" ? "bg-surface-3 text-fg-muted"
          : "bg-primary/10 text-primary";
  const label = s === "rendering" ? `Rendering ${project.progress}%` : STATUS_LABEL[s] ?? s;
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap tabular-nums ${tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${s === "rendering" || s === "analyzing" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

/** 16:9 cover — the first clip's frame, else a quiet film placeholder. */
export function ProjectCover({ project, className = "" }: { project: ProjectRow; className?: string }) {
  return (
    <div className={`relative aspect-video overflow-hidden bg-surface-3 border border-line ${className}`}>
      {project.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-fg-subtle/60">
          <IcFilm className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

export function IcFilm({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4" />
    </svg>
  );
}
