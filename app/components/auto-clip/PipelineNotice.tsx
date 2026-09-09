"use client";

import { useState } from "react";

// What the pipeline had to skip, said once and quietly.
//
// This replaces two stacked amber banners that opened with an apology and ran
// to three lines each. They were also styled light — bg-amber-50 on
// text-amber-800 — which on the dark results page read as two white slabs
// above the clips, which is what made a truthful message feel like an error
// state.
//
// The information stays. It is not decoration: "no subtitles" and "centered
// crop instead of speaker tracking" are differences the user will otherwise
// discover after downloading, and one of them ("we couldn't run face
// detection") is ours to fix rather than a fact about their file. Hiding it
// would just move the disappointment later.
//
// So: consequence first, in a few words, on one line — and the explanation a
// click away for the person who wants it.

interface NoticeCopy {
  /** The consequence, as short as it can be said. Always visible. */
  short: string;
  /** Why, and what to do about it. Behind the toggle. */
  detail: string;
}

const NOTICES: Record<string, NoticeCopy> = {
  transcription_failed: {
    short: "No subtitles — titles and insights are placeholders",
    detail:
      "We couldn't transcribe this video, so the AI never read its content. Clip moments are spaced out rather than chosen, and the titles, captions and insights are generic placeholders worth replacing.",
  },
  reframe_unavailable: {
    short: "Centered crop — no faces to follow",
    detail:
      "No faces were detected in this video, so clips use a centered crop instead of following a speaker.",
  },
  reframe_failed: {
    short: "Centered crop — speaker tracking didn't run",
    detail:
      "Speaker tracking couldn't run on our side, so clips use a centered crop. This affects every video until it's fixed — please report it if it persists.",
  },
};

/** One line for the collapsed state: the consequences, joined. */
function summarise(warnings: string[]): string {
  const parts = warnings.map((w) => NOTICES[w]?.short).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Some steps were skipped for this video";
}

export default function PipelineNotice({ warnings }: { warnings: string[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!warnings || warnings.length === 0) return null;

  const known = warnings.filter((w) => NOTICES[w]);
  // An unrecognised code still has to appear — silently dropping one would
  // make the clips wrong with no explanation at all.
  const unknown = warnings.filter((w) => !NOTICES[w]);

  return (
    <div className="mb-4 rounded-xl border border-card-border bg-surface-2/60">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <span className="mt-[3px] shrink-0 text-warning" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </span>

        <p className="flex-1 text-[12px] leading-snug text-ink-soft">
          {summarise([...known, ...unknown])}
        </p>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 text-[11px] font-semibold text-brand hover:underline cursor-pointer"
        >
          {open ? "Hide" : "Why?"}
        </button>
      </div>

      {open && (
        <div className="border-t border-card-border px-3 py-2 space-y-1.5">
          {known.map((w) => (
            <p key={w} className="text-[11.5px] leading-snug text-ink-soft">
              {NOTICES[w].detail}
            </p>
          ))}
          {unknown.map((w) => (
            <p key={w} className="text-[11.5px] leading-snug text-ink-soft">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
