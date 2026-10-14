"use client";

import { useRef, useState } from "react";
import { fmtTime, scoreBand } from "@/app/dashboard/create/auto-clip/_components/shared";
import { IcCalendar, IcDownload } from "../components/icons";
import { FeedbackButtons, type ClipHandlers } from "./ClipDetail";
import { clipName, isReady, type ViewClip } from "./model";

// A grid tile: the clip's frame (playing, muted, while hovered), its score,
// title and Edited / Dubbed chips. Clicking it opens the popup.

export function ClipGridCard({ clip, onOpen, handlers }: { clip: ViewClip; onOpen: () => void; handlers: ClipHandlers }) {
  const ready = isReady(clip);
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const name = clipName(clip);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}`}
        className="relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {clip.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {ready && hover && (
          <video
            ref={videoRef}
            src={clip.videoUrl!}
            muted
            autoPlay
            loop
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden
          />
        )}
        {!ready && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
            {clip.status === "failed" ? "Failed to render" : clip.status === "queued" ? "Queued" : `Rendering ${clip.progress}%`}
          </span>
        )}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {fmtTime(clip.durationSec)}
        </span>
      </button>
      {/* Over the frame, outside the open button: a button in a button is invalid. */}
      <div className={`absolute left-2 top-2 transition-opacity ${clip.isFavorite || clip.isDisliked ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"}`}>
        <FeedbackButtons clip={clip} onFeedback={handlers.onFeedback} compact />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {clip.score != null ? (
          <span className="text-xl font-semibold tabular-nums" style={{ color: scoreBand(clip.score).text }} aria-label={`Score ${clip.score} out of 100`}>
            {clip.score}
          </span>
        ) : (
          <span className="text-sm text-fg-subtle">–</span>
        )}
        {ready && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => handlers.onOpenWorkspace(clip, "publish")}
              aria-label={`Publish ${name}`}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <IcCalendar />
            </button>
            <a
              href={`/api/projects/${clip.projectId}/clips/${clip.id}/download`}
              download
              aria-label={`Download ${name}`}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <IcDownload />
            </a>
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug text-fg" title={name}>{name}</p>
      {(clip.edited || clip.dubbed) && (
        <div className="mt-1.5 flex gap-1.5">
          {clip.edited && <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg-muted">Edited</span>}
          {clip.dubbed && <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg-muted">Dubbed</span>}
        </div>
      )}
    </div>
  );
}
