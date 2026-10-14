"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PipelineNotice from "@/app/components/auto-clip/PipelineNotice";
import type { ProjectClipsResponse } from "./model";

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

/** Returns a state screen, or null when the page should list clips. */
export function ProjectRunState({ projectId, data }: { projectId: string; data: ProjectClipsResponse }) {
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
      <div className={BOX}>
        <div className="mx-auto mb-8 aspect-[9/16] w-[160px] overflow-hidden rounded-2xl bg-surface-3">
          <div className="ac-shimmer h-full w-full" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-fg">
          <span role="status" aria-live="polite">Finding your strongest moments</span>
        </h1>
        <p className="mb-6 text-[15px] text-fg-muted">Analyzing speech, pacing and engagement. Usually 2–5 minutes for an hour of video.</p>
        {slow && (
          <div role="status" className="mx-auto mb-6 max-w-md rounded-xl border border-warning/40 bg-tint-amber px-4 py-3 text-left text-[13px] text-fg">
            This is taking longer than usual, most likely because other videos are ahead of it in the queue. If it doesn&rsquo;t
            finish, it will be stopped automatically and you&rsquo;ll get every credit back.
          </div>
        )}
        <p className="text-[13px] text-fg-subtle">You can leave this page. Your clips will be here when you come back.</p>
        <div className="mt-6"><PipelineNotice warnings={project.warnings} /></div>
      </div>
    );
  }
  return null;
}
