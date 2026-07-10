"use client";

// Marks a control whose effect is visible in the editor preview but does not
// (yet) affect the exported video — see the TextClip field comments in
// lib/editor/types.ts for which fields this applies to and why.

export default function PreviewOnlyBadge() {
  return (
    <span className="rounded-editor-sm bg-editor-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-editor-text-faint">
      Preview only
    </span>
  );
}
