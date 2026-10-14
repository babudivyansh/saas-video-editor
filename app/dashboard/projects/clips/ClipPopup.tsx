"use client";

import { useEffect, useRef } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { IcChevronDown, IcChevronUp, IcClose } from "../components/icons";
import { ClipDetail, type ClipHandlers } from "./ClipDetail";
import { clipName, type ClipsSource, type ViewClip } from "./model";

// The grid view's popup: the clip it opened, laid out exactly as a list row,
// with ↑ / ↓ to step through the current (filtered, sorted) clips and ✕ to
// close. The Modal primitive supplies the focus trap, Esc, scroll lock and
// focus restore; this adds the arrow keys.

export function ClipPopup({
  clip, rank, total, source, handlers, onStep, onClose,
}: {
  clip: ViewClip | null;
  rank: number;
  total: number;
  source: ClipsSource;
  handlers: ClipHandlers;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
}) {
  const open = !!clip;
  const stepRef = useRef(onStep);
  useEffect(() => { stepRef.current = onStep; }, [onStep]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Leave the keys alone where they already mean something: a video's
      // scrubber, a menu, a text field.
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("video, input, textarea, select, [role='menu']"))) return;
      if (e.key === "ArrowDown") { e.preventDefault(); stepRef.current(1); }
      if (e.key === "ArrowUp") { e.preventDefault(); stepRef.current(-1); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const CONTROL =
    "flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-muted transition-colors hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40";

  return (
    <Modal
      open={open}
      onClose={onClose}
      bare
      ariaLabel={clip ? `Clip ${rank} of ${total}: ${clipName(clip)}` : "Clip"}
      maxWidth="max-w-[1100px]"
      panelClassName="bg-bg p-4 sm:p-6"
    >
      {clip && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm tabular-nums text-fg-muted" aria-live="polite">
              {rank} of {total}
            </p>
            <div className="flex gap-2">
              <button type="button" aria-label="Previous clip" className={CONTROL} disabled={total < 2} onClick={() => onStep(-1)}>
                <IcChevronUp />
              </button>
              <button type="button" aria-label="Next clip" className={CONTROL} disabled={total < 2} onClick={() => onStep(1)}>
                <IcChevronDown />
              </button>
              <button type="button" aria-label="Close" className={CONTROL} onClick={onClose}>
                <IcClose />
              </button>
            </div>
          </div>
          {/* Keyed so a step resets the preview's playback and the card's toggle. */}
          <ClipDetail key={clip.id} clip={clip} rank={rank} source={source} handlers={handlers} />
        </div>
      )}
    </Modal>
  );
}
