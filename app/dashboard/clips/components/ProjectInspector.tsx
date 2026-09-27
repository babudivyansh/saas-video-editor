"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import type { ClipRow } from "../hooks/useClipsLibrary";
import { IcTrash, IcVideo, clipHref, clipTitle, scoreTone } from "./clipUi";
import { IcFilm, ProjectStatusChip, clipCountLabel, fmtDate, projectHref, type ProjectRow } from "./projectUi";

const TILE_LIMIT = 8;

function emptyMessage(p: ProjectRow): string {
  if (p.status === "failed") return p.failureReason || "This run failed before it produced any clips.";
  if (p.status === "draft") return "This run hasn't started yet. Open it to finish setting it up.";
  if (p.status === "analyzing" || p.status === "rendering") return "Clips will appear here as they finish rendering.";
  return "This run didn't produce any clips.";
}

/** The Projects tab's right-hand panel: the source, the actions, and the clips the run produced. */
export function ProjectInspector({
  project, onRename, onDelete,
}: {
  project: ProjectRow;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { token, user } = useAuth();
  const clipsQuery = useQuery({
    queryKey: ["clips", "list", "project", project.id],
    queryFn: async (): Promise<ClipRow[]> => {
      const res = await fetch(`/api/clips?projectId=${encodeURIComponent(project.id)}&sort=score&limit=${TILE_LIMIT}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()).clips ?? [];
    },
    enabled: !!user && project._count.clips > 0,
    staleTime: 30_000,
  });
  const clips = clipsQuery.data ?? [];

  return (
    <aside
      aria-label="Project details"
      className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-5 max-h-[calc(100dvh-7rem)] overflow-y-auto"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Project</span>
        <span className="font-mono text-xs text-fg-muted">{fmtDate(project.createdAt)}</span>
      </div>

      <div className="relative aspect-video rounded-2xl overflow-hidden border border-line-strong bg-bg">
        {project.sourceUrl ? (
          // preload="none": source uploads can be long; nothing downloads until Play.
          <video
            key={project.id}
            src={project.sourceUrl}
            poster={project.coverUrl ?? undefined}
            controls
            playsInline
            preload="none"
            className="w-full h-full object-contain"
          />
        ) : project.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-subtle"><IcVideo className="w-8 h-8" /></div>
        )}
      </div>

      <h2 className="text-lg font-semibold leading-snug text-fg tracking-tight break-words">{project.title}</h2>

      <div className="flex flex-col gap-2.5">
        <Link
          href={projectHref(project)}
          className="inline-flex items-center justify-center gap-2 h-11 rounded-full grad-brand text-on-primary font-semibold shadow-glow hover:brightness-105 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
          Open project
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRename}
            className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-full border border-line-strong bg-surface-2 text-fg text-sm font-medium hover:bg-surface-3 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete project"
            title="Delete project"
            className="w-10 h-10 shrink-0 rounded-full border border-line flex items-center justify-center text-fg-muted hover:text-error hover:border-error/40 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <IcTrash />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProjectStatusChip project={project} />
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface-3 border border-line text-xs text-fg-muted">
          <IcFilm /> {clipCountLabel(project._count.clips)}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">Clips from this run</span>
        {project._count.clips === 0 ? (
          <p className="rounded-2xl border-[1.5px] border-dashed border-line-strong px-4 py-3.5 text-[13px] leading-relaxed text-fg-muted">
            {emptyMessage(project)}
          </p>
        ) : clipsQuery.isLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: Math.min(project._count.clips, 4) }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-xl bg-surface-3 animate-pulse" />
            ))}
          </div>
        ) : clipsQuery.error ? (
          <p className="text-[13px] text-error">We couldn&apos;t load this run&apos;s clips.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {clips.map((c) => {
                const tone = typeof c.score === "number" ? scoreTone(c.score) : null;
                return (
                  <Link
                    key={c.id}
                    href={clipHref(c)}
                    title={clipTitle(c)}
                    className="relative aspect-[9/16] rounded-xl overflow-hidden border border-line bg-surface-3 hover:border-primary/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt={clipTitle(c)} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-fg-subtle"><IcFilm /></span>
                    )}
                    {tone && (
                      <span className={`absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md bg-bg/80 text-[11px] font-bold ${tone.text}`}>{c.score}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            {project._count.clips > clips.length && (
              <Link href={projectHref(project)} className="text-[13px] font-medium text-primary hover:text-primary-hover">
                See all {project._count.clips} clips
              </Link>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
