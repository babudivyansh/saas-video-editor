"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef } from "react";
import { IcPlay, ClipItem, fmtTime, scoreBand, arCss, clipReason } from "./shared";
import { RetryClipButton, OverflowMenu } from "./ClipActions";
import { WorkspaceTab } from "./ClipWorkspace";

// ── Results feed clip card (ready + in-flight) ───────────────────────────────
export function ClipCard({ projectId, clip, onChanged, onOpen }: {
  projectId: string; clip: ClipItem; onChanged: () => void;
  onOpen: (clip: ClipItem, tab?: WorkspaceTab, origin?: string) => void;
}) {
  const band = scoreBand(clip.score);
  const ready = clip.status === "ready" && !!clip.videoUrl;
  const failed = clip.status === "failed";
  const cardRef = useRef<HTMLDivElement | null>(null);

  const openWith = (tab: WorkspaceTab) => {
    const el = cardRef.current;
    let origin = "50% 50%";
    if (el) {
      const r = el.getBoundingClientRect();
      origin = `${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`;
    }
    onOpen(clip, tab, origin);
  };

  return (
    <div ref={cardRef} className="ac-card rounded-2xl bg-panel overflow-hidden flex flex-col shadow-card">
      <div className="relative" style={{ aspectRatio: arCss(clip.aspectRatio), background: "linear-gradient(160deg, var(--surface-3), var(--bg) 70%)" }}>
        {clip.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Band + duration (non-interactive, under the open button) */}
        <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold shadow-sm pointer-events-none bg-black/65 backdrop-blur-sm" style={{ color: band.text }}>
          <span aria-hidden>{band.icon}</span>{band.label}
          {clip.score != null && <span className="opacity-60 tabular-nums">{clip.score}</span>}
        </span>
        <span className="absolute top-2.5 right-2.5 z-10 px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-white pointer-events-none bg-black/60">{fmtTime(clip.durationSec)}</span>

        {ready ? (
          <button type="button" onClick={() => openWith("edit")} aria-label={`Open ${clip.title || `clip ${clip.index + 1}`}`} className="group absolute inset-0 w-full h-full text-left">
            <span className="ac-reveal absolute inset-x-0 bottom-0 h-[64%] block" style={{ background: "linear-gradient(to top, rgba(9,14,26,.92), rgba(9,14,26,0))" }} />
            <span className="ac-reveal ac-rise-in absolute inset-x-3 bottom-3 block text-white">
              <span className="block text-[12px] leading-snug text-white/80 mb-2 line-clamp-2">{clipReason(clip)}</span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full grad-brand text-[12.5px] font-bold text-on-primary"><IcPlay /> Open clip</span>
            </span>
            <span className="ac-scrub absolute inset-x-0 bottom-0 h-[3px] opacity-0" style={{ background: "rgba(255,255,255,.22)" }}>
              <span className="block h-full w-2/5 bg-panel" />
            </span>
          </button>
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white text-xs font-medium px-4 text-center">
            <span className="font-semibold">Failed to render</span>
            {/* The reason was on the row and never selected, so every failure
                read the same. */}
            {clip.failureReason && <span className="text-[11px] text-white/80 leading-snug line-clamp-3">{clip.failureReason}</span>}
            <RetryClipButton projectId={projectId} clip={clip} onQueued={onChanged} />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white">
            <span className="w-9 h-9 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-xs font-semibold">{clip.status === "queued" ? "Queued" : `${clip.progress}%`}</span>
          </div>
        )}
        {clip.status === "rendering" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${clip.progress}%` }} />
          </div>
        )}
      </div>
      <div className="px-3.5 py-3 flex items-center gap-2">
        <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink leading-snug line-clamp-1">{clip.title || `Clip ${clip.index + 1}`}</p>
        {ready && (
          <OverflowMenu>
            {(close) => (
              <>
                <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download onClick={close} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Download</a>
                <button onClick={() => { close(); openWith("edit"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Edit clip</button>
                <button onClick={() => { close(); openWith("captions"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Captions</button>
                <button onClick={() => { close(); openWith("publish"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Publish / Dub</button>
              </>
            )}
          </OverflowMenu>
        )}
      </div>
    </div>
  );
}

