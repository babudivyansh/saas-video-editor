"use client";

import Link from "next/link";
import { clipCountLabel, projectHref, type ProjectRow } from "@/app/dashboard/clips/components/projectUi";
import { fmtLength } from "./format";
import { IcFilm, IcMore, IcUpload } from "./icons";

export interface ProjectCardRow extends ProjectRow {
  instructions?: string | null;
  sourceAsset?: { duration: number | null } | null;
}

const NEW_AUTOCLIP_HREF = "/dashboard/create/auto-clip";

export function projectSubtitle(p: ProjectCardRow): string {
  if (p.status === "failed") return "Failed";
  if (p.status === "analyzing") return "Analyzing your video…";
  if (p.status === "rendering") return `Rendering · ${p.progress}%`;
  if (p.status === "draft") return "Not started";
  return `AutoClip · ${clipCountLabel(p._count.clips)}`;
}

export function UploadTile() {
  return (
    <Link
      href={NEW_AUTOCLIP_HREF}
      className="group flex aspect-[3/1] sm:aspect-video flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-fg-muted transition-colors hover:border-primary/60 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <IcUpload className="w-6 h-6" />
      <span className="text-sm font-medium">Upload new video</span>
    </Link>
  );
}

export function ProjectCard({ project, onMenu }: { project: ProjectCardRow; onMenu: (e: React.MouseEvent) => void }) {
  const duration = project.sourceAsset?.duration ?? null;
  const active = project.status === "analyzing" || project.status === "rendering";
  const failed = project.status === "failed";
  return (
    <div className="group relative">
      <Link
        href={projectHref(project)}
        onContextMenu={onMenu}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-surface-3">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fg-subtle">
              {/* A status badge sits here instead while a run is going or failed. */}
              {!active && !failed && <IcFilm className="w-6 h-6" />}
            </div>
          )}
          {(active || failed) && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${failed ? "bg-error/15 text-error" : "bg-primary/15 text-primary"}`}>
                {failed ? "Failed" : project.status === "rendering" ? `Rendering ${project.progress}%` : "Analyzing…"}
              </span>
            </div>
          )}
          {duration != null && duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-bg/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg">
              {fmtLength(duration)}
            </span>
          )}
        </div>
        <p className="mt-2.5 truncate pr-10 text-sm font-medium text-fg" title={project.title}>
          {project.title}
        </p>
        <p className={`mt-0.5 text-xs ${failed ? "text-error" : "text-fg-subtle"}`}>{projectSubtitle(project)}</p>
      </Link>
      <button
        type="button"
        aria-label={`Project actions for ${project.title}`}
        onClick={onMenu}
        className="absolute right-0 top-[calc(100%-2.75rem)] flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <IcMore />
      </button>
    </div>
  );
}
