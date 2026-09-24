"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import PipelineNotice from "@/app/components/auto-clip/PipelineNotice";
import { ScorePerformanceBanner } from "@/app/components/auto-clip/ScorePerformanceBanner";
import { Button } from "@/app/components/ui/Button";
import { type GenerateStatus } from "@/app/hooks/useVideoGenerate";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { IcFilm, IcClock, ApiError, apiFetch, SortKey, ClipItem, ProjectMeta } from "./shared";
import { ClipCard } from "./ClipCard";
import { WorkspaceTab, ClipWorkspace } from "./ClipWorkspace";

// ── Results orchestrator (processing → feed → workspace) ─────────────────────

// A pure function of the query's last-known data, not inline in the
// useQuery call, so the "when do we stop polling" decision is testable
// without needing real or faked timers — react-query calls this itself on
// its own schedule; the test only needs to check what it WOULD return.
export function autoClipPollIntervalMs(
  data: { project: ProjectMeta; clips: ClipItem[] } | undefined,
  error?: unknown,
): number | false {
  // A project that isn't there (deleted, or discarded after a refused start)
  // will not appear by asking again. This polled a 404 every 2.5s forever.
  if (error instanceof ApiError && error.status === 404) return false;
  if (!data) return 2500;
  const settled = data.project.status === "completed" || data.project.status === "failed";
  const inFlight = data.clips.some((c) => c.status === "queued" || c.status === "rendering");
  return !settled || inFlight ? 2500 : false;
}

export const DEFAULT_PROJECT_META: ProjectMeta = { status: "rendering", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null };
export const EMPTY_CLIPS: ClipItem[] = [];

export function ClipsResults({ projectId, status, error, expectedCount, fileName, onReset, onRetry, initialClipId }: {
  projectId: string | null;
  status: GenerateStatus;
  error: string | null;
  expectedCount: number;
  fileName: string | null;
  onReset: () => void;
  /** Re-run this (failed) project from the form, keeping its settings. */
  onRetry?: (fileName: string | null) => void;
  /** Deep link target — opens this clip's workspace once the clip exists. */
  initialClipId?: string | null;
}) {
  const clipsQuery = useQuery({
    queryKey: ["auto-clip-project", projectId],
    queryFn: () => apiFetch<{ project: ProjectMeta; clips: ClipItem[] }>(`/api/projects/${projectId}/clips`),
    enabled: !!projectId,
    // Keep polling while anything could still change — re-evaluated on every
    // fetch (including a failed one, which leaves .data at its last good
    // value: same "silently keep polling on a transient error" behavior the
    // old setInterval had, without a bare catch swallowing the error).
    refetchInterval: (query) => autoClipPollIntervalMs(query.state.data, query.state.error),
  });
  // Stable fallback references, not inline `?? []` / `?? {...}` literals —
  // the edits-seeding effect below depends on `clips` by reference, and a
  // fresh empty array every render (while the query is still loading) would
  // make that dependency look "changed" every render, firing the effect's
  // setState every time and looping forever (verified: reproduced an OOM
  // from a single render with an inline `?? []` here).
  const clips = clipsQuery.data?.clips ?? EMPTY_CLIPS;
  const project = clipsQuery.data?.project ?? DEFAULT_PROJECT_META;
  const fireReviewPrompt = useReviewPromptTrigger();
  const reviewPromptFiredRef = useRef(false);

  // Workspace selection.
  const [openId, setOpenId] = useState<string | null>(null);
  // A deep link arrives before the clips do, so the open is deferred until the
  // clip actually exists — and consumed once, so closing the workspace doesn't
  // immediately reopen it.
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  const [openTab, setOpenTab] = useState<WorkspaceTab>("edit");
  const [openOrigin, setOpenOrigin] = useState("50% 50%");

  const [sort, setSort] = useState<SortKey>("score");

  if (initialClipId && !deepLinkConsumed && clips.some((c) => c.id === initialClipId)) {
    setDeepLinkConsumed(true);
    setOpenId(initialClipId);
  }

  const projectStatus = project.status;

  // Memoized: the query re-renders this every 2.5s while a run is live, and
  // a fresh sorted copy each time re-rendered every card with it.
  const readyClips = useMemo(() => clips.filter((c) => c.status === "ready" && c.videoUrl), [clips]);
  const sortedClips = useMemo(() => [...clips].sort((a, b) => {
    if (sort === "order") return a.index - b.index;
    if (sort === "duration") return b.durationSec - a.durationSec;
    return (b.score ?? -1) - (a.score ?? -1);
  }), [clips, sort]);

  const ready = clips.filter((c) => c.status === "ready").length;
  const total = clips.length || expectedCount;
  const failedHard = status === "failed" || (projectStatus === "failed" && clips.length > 0 && clips.every((c) => c.status === "failed")) || (projectStatus === "failed" && clips.length === 0);
  // A completed project with zero clips used to satisfy `analyzing` and sit on
  // "Finding your strongest moments…" forever — while polling had already
  // stopped, so it would never resolve on its own. That is a real outcome (the
  // model found nothing worth cutting, or every pick was dropped at review),
  // and it needs to be said rather than hidden behind a spinner.
  // A completed project with zero clips is a real outcome (the model found
  // nothing worth cutting) and needs to be said rather than hidden behind a
  // spinner. The old `pending_review` arm went with the review step.
  const settledEmpty = clips.length === 0 && projectStatus === "completed";
  const analyzing = clips.length === 0 && !failedHard && !settledEmpty;
  // Twenty minutes with no sign of life from the pick job. The clock ticks
  // once a minute from an effect — reading Date.now() during render is impure
  // (react-hooks/purity), and is the exact error that failed CI on #228.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const analysisIsSlow = analyzing && projectStatus === "analyzing" && !!project.updatedAt
    && nowMs - new Date(project.updatedAt).getTime() > 20 * 60 * 1000;
  const allDone = projectStatus === "completed";

  useEffect(() => {
    if (!allDone || reviewPromptFiredRef.current) return;
    reviewPromptFiredRef.current = true;
    fireReviewPrompt("autoclips_milestone", { featureHint: "auto_clips" }).catch(() => {});
  }, [allDone, fireReviewPrompt]);

  // The review step (select / trim / confirm-and-pay) is gone: Generate now
  // charges up front and renders every clip. Its state, its estimate query and
  // its confirm mutation went with it — the credit gate and the 402
  // insufficient-credits response now live on the create route instead.

  const openClip = (clip: ClipItem, tab: WorkspaceTab = "edit", origin = "50% 50%") => { setOpenId(clip.id); setOpenTab(tab); setOpenOrigin(origin); };
  const transcriptionFailed = project.warnings?.includes("transcription_failed") ?? false;

  if (clipsQuery.error instanceof ApiError && clipsQuery.error.status === 404) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 px-6 space-y-4">
        <h2 className="text-xl font-extrabold text-fg">This run isn&apos;t here any more</h2>
        <p className="text-sm text-fg-muted leading-relaxed">It may have been deleted, or it never started. Nothing was charged for a run that didn&apos;t start.</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="secondary" onClick={onReset}>Start a new run</Button>
        </div>
      </div>
    );
  }

  // ── Processing (upload + analysis) — honest, single state ──
  if (settledEmpty) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 px-6 space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl grad-brand flex items-center justify-center text-on-primary"><IcFilm /></div>
        <h2 className="text-xl font-extrabold text-ink">No clips came out of this video</h2>
        <p className="text-sm text-ink-soft leading-relaxed">
          The AI didn&apos;t find a segment worth cutting — that usually means the
          source is very short, mostly silence, or has no clear standalone moment.
          Try a longer video, or one with more spoken content.
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="secondary" onClick={onReset}>Try another video</Button>
        </div>
      </div>
    );
  }

  if (analyzing || status === "uploading") {
    const heading = failedHard ? "Something went wrong" : status === "uploading" ? "Uploading your video…" : "Finding your strongest moments";
    return (
      <div className="max-w-xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="relative w-[180px] mx-auto mb-8 rounded-2xl overflow-hidden shadow-card" style={{ aspectRatio: "9/16", background: "linear-gradient(160deg, var(--surface-3), var(--bg))" }}>
          <div className="ac-shimmer absolute inset-0" />
          <div className="absolute left-0 right-0 bottom-0 p-3.5 text-left">
            <div className="h-2 w-[70%] rounded bg-white/35 mb-1.5" />
            <div className="h-2 w-[45%] rounded bg-white/20" />
          </div>
        </div>
        {/* Announced: this is the only signal a screen-reader user gets that the
            run moved from upload to analysis. */}
        <h1 role="status" aria-live="polite" className="text-2xl font-extrabold text-ink mb-2">{heading}</h1>
        <p className="text-[15px] text-ink-soft mb-7">{status === "uploading" ? "Uploading your source video…" : `Analyzing speech, pacing and engagement${fileName ? ` across ${fileName}` : ""}.`}</p>
        <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden max-w-[360px] mx-auto mb-2.5 relative">
          <div className="ac-shimmer absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, var(--brand), transparent)" }} />
        </div>
        <p className="text-[13px] text-ink-soft mb-8">Usually 2–5 minutes for an hour of video.</p>
        {analysisIsSlow && (
          // Said, not spun: a run can wait in the queue, and a stranded one is
          // failed and fully refunded by the sweep. It used to spin forever.
          <div role="status" className="mb-6 mx-auto max-w-md rounded-xl border border-warning/40 bg-tint-amber px-4 py-3 text-[13px] text-fg text-left">
            This is taking longer than usual, most likely because other videos are ahead of it in the queue.
            If it doesn&apos;t finish, it will be stopped automatically and you&apos;ll get every credit back.
          </div>
        )}
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-card-border bg-panel px-4 py-3 text-[13px] text-ink-soft">
          <span className="text-brand"><IcClock /></span>
          You can leave this page — your clips will be ready when you return.
        </div>
        <div className="mt-6"><PipelineNotice warnings={project.warnings} /></div>
      </div>
    );
  }

  if (failedHard) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-20 pb-32 text-center">
        <h1 className="text-2xl font-extrabold text-ink mb-2">Something went wrong</h1>
        <p className="text-[15px] text-ink-soft mb-7">{project.failureReason ?? error ?? "We couldn't generate clips from this video. Please try again."}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* A failed run is re-runnable on the same video: the create route
              re-claims a "failed" project. This used to offer only "Create
              another", which threw the settings away too. */}
          {onRetry && projectId && projectStatus === "failed" && (
            <button onClick={() => onRetry(fileName)} className="inline-flex items-center gap-2 grad-brand shadow-glow text-on-primary text-sm font-bold px-6 py-3 rounded-xl">Try again</button>
          )}
          <Button variant="secondary" onClick={onReset}>Start over</Button>
        </div>
      </div>
    );
  }

  const openIdx = openId ? sortedClips.findIndex((c) => c.id === openId) : -1;
  const openClipItem = openIdx >= 0 ? sortedClips[openIdx] : null;

  return (
    <div className="max-w-[1240px] mx-auto px-6 md:px-8 pt-8 pb-40">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <h1 role="status" aria-live="polite" className="text-[28px] font-extrabold tracking-tight text-ink mb-1.5">{allDone ? "Your clips are ready 🎉" : "Generating your clips"}</h1>
          <p className="text-sm text-ink-soft">
            {`${ready} of ${total} ready${fileName ? ` · ${fileName}` : ""}`}
          </p>
        </div>
        {readyClips.length > 1 && (
          <div className="flex items-center gap-4">
            <select aria-label="Sort clips" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border-0 bg-transparent py-1.5 text-[13px] font-semibold text-ink-soft cursor-pointer">
              <option value="score">Best first</option>
              <option value="order">Order in video</option>
              <option value="duration">Longest first</option>
            </select>
            <a href={`/api/projects/${projectId}/clips/download-all`} className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Download all ({readyClips.length})</a>
          </div>
        )}
        {allDone && (
          <button onClick={onReset} className="text-[13px] font-semibold text-brand hover:underline">Create another</button>
        )}
      </div>

      {/* Progress bar while rendering */}
      {!allDone && (
        <div className="mb-6 h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full bg-brand transition-all duration-500" style={{ width: `${total ? (ready / total) * 100 : 0}%` }} />
        </div>
      )}

      <PipelineNotice warnings={project.warnings} />
      {allDone && <div className="mb-4"><ScorePerformanceBanner /></div>}

      {/* Feed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {sortedClips.length > 0
          ? sortedClips.map((c) => (
              <ClipCard key={c.id} projectId={projectId!} clip={c} onChanged={() => clipsQuery.refetch()} onOpen={openClip} />
            ))
          : Array.from({ length: Math.max(1, expectedCount) }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-panel overflow-hidden shadow-card">
                <div className="relative" style={{ aspectRatio: "9/16", background: "linear-gradient(160deg, var(--surface-3), var(--bg))" }}><div className="ac-shimmer absolute inset-0" /></div>
                <div className="p-3.5 space-y-2"><div className="h-3 bg-surface-3 rounded animate-pulse" /><div className="h-2 w-1/2 bg-surface-3 rounded animate-pulse" /></div>
              </div>
            ))}
      </div>

      {/* Workspace overlay (ready clips) */}
      {openClipItem && openClipItem.status === "ready" && (
        <ClipWorkspace
          key={openClipItem.id}
          projectId={projectId!}
          clip={openClipItem}
          transcriptionFailed={transcriptionFailed}
          initialTab={openTab}
          expandOrigin={openOrigin}
          index={openIdx}
          total={sortedClips.length}
          onPrev={() => { const p = sortedClips[(openIdx - 1 + sortedClips.length) % sortedClips.length]; if (p) setOpenId(p.id); }}
          onNext={() => { const n = sortedClips[(openIdx + 1) % sortedClips.length]; if (n) setOpenId(n.id); }}
          onClose={() => setOpenId(null)}
          onChanged={() => clipsQuery.refetch()}
          onOpenSibling={(clipId) => setOpenId(clipId)}
          siblingClipIds={sortedClips.filter((c) => c.id !== openClipItem.id && c.status === "ready").map((c) => c.id)}
        />
      )}

    </div>
  );
}

