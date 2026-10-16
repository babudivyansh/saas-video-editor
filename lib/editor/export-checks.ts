// Checks run on the timeline right before an export (the full-screen export
// page lists them). Pure and client-safe. A "block" stops the export; the
// rest are advice the user can ignore.

import type { TimelineDoc, TrackKind } from "./types";

export type ExportCheckLevel = "ok" | "info" | "warn" | "block";

export interface ExportCheck {
  id: string;
  level: ExportCheckLevel;
  message: string;
  /** Where to jump the playhead for "Show me". */
  at?: number;
  /** What to select for "Show me". */
  clip?: { track: TrackKind; id: string };
}

/** Captions this close to the top/bottom edge sit under platform buttons. */
export const SAFE_TOP = 0.08;
export const SAFE_BOTTOM = 0.88;
/** Text and a caption whose centres are closer than this (fraction of frame height) overlap on screen. */
const VERTICAL_CLASH = 0.12;

function overlaps(aStart: number, aDur: number, bStart: number, bDur: number) {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

export function runExportChecks(doc: TimelineDoc): ExportCheck[] {
  const checks: ExportCheck[] = [];
  const video = doc.tracks.video.filter((c) => !c.hidden);
  const captions = doc.tracks.caption.filter((c) => !c.hidden);
  const texts = doc.tracks.text.filter((c) => !c.hidden);
  const audio = doc.tracks.audio.filter((c) => !c.hidden);

  if (video.length === 0) {
    checks.push({ id: "no-video", level: "block", message: "Add at least one video clip before exporting." });
  } else {
    checks.push({ id: "has-video", level: "ok", message: `${video.length} video clip${video.length === 1 ? "" : "s"} on the timeline` });
  }

  if (captions.length > 0) {
    const outside = captions.filter((c) => c.y < SAFE_TOP || c.y > SAFE_BOTTOM);
    if (outside.length > 0) {
      checks.push({
        id: "caption-safe-area",
        level: "warn",
        message: `${outside.length} caption${outside.length === 1 ? " sits" : "s sit"} near the edge, where app buttons can cover ${outside.length === 1 ? "it" : "them"}`,
        at: outside[0].timelineStart,
        clip: { track: "caption", id: outside[0].id },
      });
    } else {
      checks.push({ id: "caption-safe-area", level: "ok", message: "All captions inside the safe area" });
    }
  }

  for (const t of texts) {
    const clash = captions.find((c) => overlaps(t.timelineStart, t.duration, c.timelineStart, c.duration) && Math.abs(t.y - c.y) < VERTICAL_CLASH);
    if (clash) {
      const from = Math.max(t.timelineStart, clash.timelineStart);
      const to = Math.min(t.timelineStart + t.duration, clash.timelineStart + clash.duration);
      const label = (t.name || t.text || "Text").trim().slice(0, 40);
      checks.push({
        id: `text-caption-${t.id}`,
        level: "warn",
        message: `“${label}” overlaps a caption on screen for ${Math.max(0.1, to - from).toFixed(1)} s`,
        at: from,
        clip: { track: "text", id: t.id },
      });
      break; // one is enough to send the user looking
    }
  }

  const hasSound = audio.length > 0 || video.some((v) => !v.muted && v.volume > 0);
  if (video.length > 0 && !hasSound) {
    checks.push({ id: "no-sound", level: "warn", message: "The export has no sound — every video clip is muted and there's no audio track" });
  }

  const hiddenCount = (["video", "text", "audio", "image", "caption"] as const).reduce(
    (n, k) => n + (doc.tracks[k] as { hidden?: boolean }[]).filter((c) => c.hidden).length,
    0,
  );
  if (hiddenCount > 0) {
    checks.push({ id: "hidden", level: "info", message: `${hiddenCount} hidden clip${hiddenCount === 1 ? " is" : "s are"} left out of the export` });
  }

  return checks;
}

export function hasBlockingCheck(checks: ExportCheck[]): boolean {
  return checks.some((c) => c.level === "block");
}
