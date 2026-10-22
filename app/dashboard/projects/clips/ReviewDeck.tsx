"use client";
// Keep or skip (design C5): one finished clip at a time, best first. Keep
// hearts the clip (the existing favorite), Skip un-hearts it if it was kept —
// nothing negative is written, so skipping never feeds the dislike signal.
// The kept clips go on to the share page in the URL.

import { useMemo, useState } from "react";
import Link from "next/link";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/app/dashboard/create/auto-clip/_components/shared";
import { ProjectGone } from "./RunStates";
import { useClipsSource } from "./useClipsSource";
import { clipName, isReady, sortClips, type ProjectClipsResponse, type ViewClip } from "./model";
import s from "./review.module.css";

type Decision = "keep" | "skip";

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

export function shareHref(projectId: string, ids: string[]) {
  return `/dashboard/projects/${projectId}/share${ids.length ? `?clips=${ids.map(encodeURIComponent).join(",")}` : ""}`;
}

export function ReviewDeck({ projectId }: { projectId: string }) {
  const { query, setFeedback } = useClipsSource({ kind: "project", id: projectId });
  const { showToast } = useToast();
  const data = query.data as ProjectClipsResponse | undefined;
  // Best first. Hearting doesn't change a score, so the order holds steady.
  const clips = useMemo<ViewClip[]>(() => sortClips((data?.clips ?? []).filter(isReady), "score"), [data]);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [index, setIndex] = useState(0);
  const [fly, setFly] = useState<Decision | null>(null);

  if (query.error instanceof ApiError && query.error.status === 404) return <ProjectGone />;

  const title = data?.project.title ?? "Project";
  const done = clips.length > 0 && index >= clips.length;
  const current = clips[index];
  const keptIds = clips.filter((c) => decisions[c.id] === "keep").map((c) => c.id);

  const decide = (d: Decision) => {
    if (!current || fly) return;
    setFly(d);
    const clip = current;
    if (d === "keep" && !clip.isFavorite) setFeedback(clip, "isFavorite", true).catch((e: Error) => showToast(e.message, "error"));
    if (d === "skip" && clip.isFavorite) setFeedback(clip, "isFavorite", false).catch((e: Error) => showToast(e.message, "error"));
    window.setTimeout(() => {
      setDecisions((prev) => ({ ...prev, [clip.id]: d }));
      setIndex((i) => i + 1);
      setFly(null);
    }, 380);
  };

  const allIds = clips.map((c) => c.id);

  return (
    <div className={`flex min-h-full flex-col ${s.page}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-8">
        <div className="min-w-0 max-w-[460px]">
          <Breadcrumbs items={[{ label: "Your projects", href: "/dashboard/projects" }, { label: title, href: `/dashboard/projects/${projectId}` }, { label: "Review" }]} />
        </div>
        {clips.length > 0 && (
          <div className={s.dots} aria-hidden="true">
            {clips.map((c, i) => (
              <i key={c.id} className={decisions[c.id] === "keep" ? s.kept : decisions[c.id] === "skip" ? s.skipped : i === index ? s.current : ""} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/projects/${projectId}`} className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] font-semibold text-fg hover:bg-surface-2">View all clips</Link>
          {!done && clips.length > 0 && (
            <Link href={shareHref(projectId, allIds)} className="text-[13px] font-semibold text-primary hover:underline">Keep all and continue →</Link>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-7 px-6 pb-16 pt-6 text-center">
        {!data && !query.error && <Skeleton className="aspect-[9/16] w-[320px] rounded-[26px]" />}

        {data && clips.length === 0 && (
          <div className="flex max-w-md flex-col items-center gap-3">
            <h1 className="text-[32px] font-bold tracking-[-0.03em] text-fg">Nothing to review yet</h1>
            <p className="text-fg-muted">Clips show up here as soon as they finish rendering.</p>
            <Link href={`/dashboard/projects/${projectId}`} className="mt-2 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">Back to the project</Link>
          </div>
        )}

        {current && !done && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">Keep this one?</h1>
              <span className="text-[15px] text-fg-muted">Clip {index + 1} of {clips.length} · {keptIds.length} kept so far</span>
            </div>
            <div
              className={s.stack}
              tabIndex={0}
              aria-label="Clip under review. Right arrow keeps it, left arrow skips it."
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") { e.preventDefault(); decide("keep"); }
                if (e.key === "ArrowLeft") { e.preventDefault(); decide("skip"); }
              }}
            >
              {/* The next two, stacked behind. */}
              {[2, 1].map((k) => {
                const c = clips[index + k];
                if (!c) return null;
                return (
                  <div key={c.id} aria-hidden="true" className={`${s.card} ${s.ghost}`} style={{ transform: `translateY(${k * 16}px) scale(${1 - k * 0.05})`, opacity: 0.7, zIndex: 10 - k }}>
                    {c.thumbnailUrl && <img src={c.thumbnailUrl} alt="" />}
                  </div>
                );
              })}
              <div key={current.id} className={`${s.card} ${fly === "keep" ? s.flyRight : fly === "skip" ? s.flyLeft : ""}`} style={{ zIndex: 20 }}>
                <video src={current.videoUrl ?? undefined} poster={current.thumbnailUrl ?? undefined} autoPlay muted loop playsInline aria-label={clipName(current)} />
                {current.score != null && (
                  <span className="absolute left-3.5 top-3.5 rounded-lg bg-bg/80 px-2.5 py-1 font-mono text-xs font-semibold text-primary">★ {current.score}</span>
                )}
                <span className={s.shade} />
                <span className="absolute inset-x-4 bottom-4 flex flex-col gap-1 text-left">
                  <b className="text-[17px] leading-tight text-fg">{clipName(current)}</b>
                  <span className="text-[13px] text-fg-muted">{fmt(current.durationSec)} · from {fmt(current.startSec)}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-7">
              <button type="button" onClick={() => decide("skip")} aria-label="Skip this clip" className={`${s.round} h-[76px] w-[76px] border border-line-strong bg-surface-2 text-error`}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
              <button type="button" onClick={() => decide("keep")} aria-label="Keep this clip" className={`${s.round} ${s.keep} h-[92px] w-[92px] bg-primary text-on-primary`}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
              </button>
            </div>
            <p className="text-xs text-fg-subtle">Tip: focus the clip and use ← and → on your keyboard.</p>
          </>
        )}

        {done && (
          <div className={`${s.pop} flex flex-col items-center gap-4`}>
            <span className="text-[120px] font-extrabold leading-none text-primary tabular-nums">{keptIds.length}</span>
            <h1 className="text-[40px] font-bold tracking-[-0.03em] text-fg">clip{keptIds.length === 1 ? "" : "s"} kept</h1>
            <p className="text-fg-muted">Kept clips are hearted. Skipped ones stay in your project if you change your mind.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={() => { setDecisions({}); setIndex(0); }} className="inline-flex h-12 items-center rounded-full border border-line-strong px-5 font-semibold text-fg hover:bg-surface-2">Start over</button>
              {keptIds.length > 0 ? (
                <Link href={shareHref(projectId, keptIds)} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover">Post or download →</Link>
              ) : (
                <Link href={`/dashboard/projects/${projectId}`} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover">Back to the project</Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
