"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectClipsResponse } from "./model";
import rs from "./runstate.module.css";

// What a project's clips page shows before there are clips to list: the run is
// still analyzing, it failed, it finished with nothing worth cutting, or the
// project is gone. Carried over from the AutoClip results page (ClipsResults),
// with "Try again" sending the failed project back to the create form.

const BOX = "mx-auto max-w-xl px-6 py-16 text-center";
const LINK = "inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export function ProjectGone() {
  return (
    <div className={BOX}>
      <h1 className="mb-2 text-xl font-semibold text-fg">This project isn&rsquo;t here any more</h1>
      <p className="mb-6 text-sm text-fg-muted">It may have been deleted, or it never started. Nothing was charged for a run that didn&rsquo;t start.</p>
      <Link href="/dashboard/projects" className={`${LINK} border border-line bg-surface-2 text-fg hover:bg-surface-3`}>Back to your projects</Link>
    </div>
  );
}

export function CollectionGone() {
  return (
    <div className={BOX}>
      <h1 className="mb-2 text-xl font-semibold text-fg">This collection isn&rsquo;t here any more</h1>
      <p className="mb-6 text-sm text-fg-muted">It may have been deleted. The clips that were in it are still in their projects.</p>
      <Link href="/dashboard/projects" className={`${LINK} border border-line bg-surface-2 text-fg hover:bg-surface-3`}>Back to your projects</Link>
    </div>
  );
}

/** A run that hasn't settled: still analyzing, or still rendering its clips. */
export function isRunInProgress(status: string | undefined): boolean {
  return status === "analyzing" || status === "rendering";
}

/** The clips' own render progress, averaged. A failed clip counts as done. */
export function renderPercent(clips: { status: string; progress: number }[]): number {
  if (clips.length === 0) return 0;
  const sum = clips.reduce(
    (t, c) => t + (c.status === "ready" || c.status === "failed" ? 100 : Math.max(0, Math.min(100, c.progress))),
    0,
  );
  return Math.round(sum / clips.length);
}

/**
 * Returns a state screen, or null when the page should list clips.
 *
 * `listHref` is set while the page is holding a rendering run on this screen
 * (it goes on to the review step when the run finishes): the link that shows
 * the clips finished so far instead. Without it a run with clips lists them.
 */
export function ProjectRunState({ projectId, data, listHref }: { projectId: string; data: ProjectClipsResponse; listHref?: string }) {
  const { project, clips } = data;
  // Twenty minutes with no sign of life from the pick job. The clock ticks
  // once a minute from an effect — reading Date.now() during render is impure.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const failedHard =
    project.status === "failed" && (clips.length === 0 || clips.every((c) => c.status === "failed"));
  if (failedHard) {
    return (
      <div className={BOX}>
        <h1 className="mb-2 text-2xl font-semibold text-fg">Something went wrong</h1>
        <p className="mb-7 text-[15px] text-fg-muted">{project.failureReason ?? "We couldn't make clips from this video. Try again."}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* The create route re-claims a failed project, so its video needn't be uploaded again. */}
          <Link
            href={`/dashboard/create/auto-clip?retry=${encodeURIComponent(projectId)}&name=${encodeURIComponent(project.title)}`}
            className={`${LINK} grad-brand text-on-primary`}
          >
            Try again
          </Link>
          <Link href="/dashboard/projects" className={`${LINK} border border-line bg-surface-2 text-fg hover:bg-surface-3`}>Back to your projects</Link>
        </div>
      </div>
    );
  }

  if (clips.length === 0 && project.status === "completed") {
    return (
      <div className={BOX}>
        <h1 className="mb-2 text-xl font-semibold text-fg">No clips came out of this video</h1>
        <p className="mb-6 text-sm text-fg-muted">
          AutoClip didn&rsquo;t find a moment worth cutting. That usually means the video is very short, mostly silence,
          or has no clear standalone moment. Try a longer video, or one with more talking.
        </p>
        <Link href="/dashboard/create/auto-clip" className={`${LINK} border border-line bg-surface-2 text-fg hover:bg-surface-3`}>Try another video</Link>
      </div>
    );
  }

  if (clips.length === 0) {
    const slow = project.status === "analyzing" && !!project.updatedAt && nowMs - new Date(project.updatedAt).getTime() > 20 * 60 * 1000;
    return (
      <div className={`${rs.stage} -mx-4 px-4 sm:-mx-8 sm:px-8`}>
        <span className={rs.sweep} aria-hidden="true" />
        <span className={rs.orb} aria-hidden="true" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-2 py-16 text-center">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">Listening to your video</span>
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[52px]">
            <span role="status" aria-live="polite">Finding your strongest moments</span>
          </h1>
          {/* What the analysis does, in turn. Not progress: the step reports none. */}
          <div className={rs.lines} aria-hidden="true">
            <span>Reading every word that’s said</span>
            <span>Spotting hooks, punchlines and stories</span>
            <span>Choosing clean start and end points</span>
          </div>
          <div className={rs.ghosts} aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="text-[15px] text-fg-muted">Usually 2–5 minutes for an hour of video. Clips appear here as soon as they’re cut.</p>
        </div>
      <div className={`${BOX} relative pt-0`}>
        {slow && (
          <div role="status" className="mx-auto mb-6 max-w-md rounded-xl border border-warning/40 bg-tint-amber px-4 py-3 text-left text-[13px] text-fg">
            This is taking longer than usual, most likely because other videos are ahead of it in the queue. If it doesn&rsquo;t
            finish, it will be stopped automatically and you&rsquo;ll get every credit back.
          </div>
        )}
        <p className="text-[13px] text-fg-subtle">You can leave this page. Your clips will be here when you come back.</p>      </div>
      </div>
    );
  }

  if (listHref && isRunInProgress(project.status)) {
    const ready = clips.filter((c) => c.status === "ready" && !!c.videoUrl).length;
    const pct = renderPercent(clips);
    return (
      <div className={`${rs.stage} -mx-4 px-4 sm:-mx-8 sm:px-8`}>
        <span className={rs.orb} aria-hidden="true" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-2 py-16 text-center">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Found {clips.length} moment{clips.length === 1 ? "" : "s"}
          </span>
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[52px]">
            <span role="status" aria-live="polite">Cutting your clips</span>
          </h1>
          <div className="flex w-full max-w-md flex-col gap-2">
            {/* Real progress: the average of the clips' own render progress. */}
            <div className={rs.bar} role="progressbar" aria-label="Clips rendered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[15px] text-fg-muted tabular-nums">{ready} of {clips.length} clips ready</p>
          </div>
          <p className="text-[15px] text-fg-muted">When they&rsquo;re all done you&rsquo;ll review them one at a time, then see them all together.</p>
          {ready > 0 && (
            <Link href={listHref} className={`${LINK} border border-line bg-surface-2 text-fg hover:bg-surface-3`}>
              See the {ready === 1 ? "clip" : `${ready} clips`} ready so far
            </Link>
          )}
          <p className="text-[13px] text-fg-subtle">You can leave this page. Your clips will be here when you come back.</p>
        </div>
      </div>
    );
  }
  return null;
}
