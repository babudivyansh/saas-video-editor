"use client";

import { STATUS_LABEL } from "@/app/components/dashboard/ProjectStatusBadge";
import { projectHref as projectLink } from "@/lib/project-links";

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
  /** Highest clip virality score in the run. Only with ?cover=1. */
  bestScore?: number | null;
  _count: { clips: number };
}

export function projectHref(p: ProjectRow): string {
  return projectLink(p.id);
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

